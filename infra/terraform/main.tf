terraform {
  required_version = ">= 1.9, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" {
  region = var.region
  default_tags { tags = { Project = "nexo", Environment = var.environment, ManagedBy = "terraform" } }
}
variable "region" {
  type    = string
  default = "us-east-1"
}
variable "environment" {
  type    = string
  default = "development"
}
variable "bucket_name" {
  type        = string
  description = "Nombre S3 globalmente único para documentos privados."
}
variable "role_trusted_service" {
  type    = string
  default = "ecs-tasks.amazonaws.com"
}
data "aws_caller_identity" "current" {}
locals {
  prefix    = "nexo-${var.environment}"
  services  = toset(["operations", "documents", "notifications"])
  queues    = toset(["documents", "notifications"])
  topic_arn = "arn:aws:sns:${var.region}:${data.aws_caller_identity.current.account_id}:${local.prefix}-events"
}
resource "aws_kms_key" "events" {
  description             = "NEXO SNS event encryption"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Sid = "AccountAdministration", Effect = "Allow", Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }, Action = "kms:*", Resource = "*" },
    { Sid = "SNSService", Effect = "Allow", Principal = { Service = "sns.amazonaws.com" }, Action = ["kms:Decrypt", "kms:GenerateDataKey*"], Resource = "*", Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }, ArnEquals = { "aws:SourceArn" = local.topic_arn } } }
  ] })
}
resource "aws_sns_topic" "events" {
  name              = "${local.prefix}-events"
  kms_master_key_id = aws_kms_key.events.arn
}
resource "aws_sqs_queue" "dlq" {
  for_each                  = local.queues
  name                      = "${local.prefix}-${each.key}-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_sqs_queue" "work" {
  for_each                   = local.queues
  name                       = "${local.prefix}-${each.key}"
  visibility_timeout_seconds = 60
  receive_wait_time_seconds  = 10
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn, maxReceiveCount = 5 })
}
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  for_each             = local.queues
  queue_url            = aws_sqs_queue.dlq[each.key].url
  redrive_allow_policy = jsonencode({ redrivePermission = "byQueue", sourceQueueArns = [aws_sqs_queue.work[each.key].arn] })
}
resource "aws_sqs_queue_policy" "sns" {
  for_each  = local.queues
  queue_url = aws_sqs_queue.work[each.key].url
  policy    = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "sns.amazonaws.com" }, Action = "sqs:SendMessage", Resource = aws_sqs_queue.work[each.key].arn, Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.events.arn } } }] })
}
resource "aws_sns_topic_subscription" "work" {
  for_each             = local.queues
  topic_arn            = aws_sns_topic.events.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.work[each.key].arn
  raw_message_delivery = true
  filter_policy        = each.key == "documents" ? jsonencode({ eventType = ["OrderConfirmed", "OrderDispatched"] }) : null
  depends_on           = [aws_sqs_queue_policy.sns]
}
resource "aws_s3_bucket" "documents" { bucket = var.bucket_name }
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket                  = aws_s3_bucket.documents.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_policy" "tls" {
  bucket = aws_s3_bucket.documents.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Sid = "TLSOnly", Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.documents.arn, "${aws_s3_bucket.documents.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }] })
}
resource "aws_secretsmanager_secret" "runtime" {
  for_each                = local.services
  name                    = "${local.prefix}/${each.key}"
  recovery_window_in_days = 30
  description             = "JWT_SECRET y URL de PostgreSQL del servicio ${each.key}. Cargar el valor fuera de Terraform."
}
resource "aws_iam_role" "service" {
  for_each           = local.services
  name               = "${local.prefix}-${each.key}"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = var.role_trusted_service }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "service" {
  for_each = local.services
  name     = "${local.prefix}-${each.key}-runtime"
  role     = aws_iam_role.service[each.key].id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat(
    [{ Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = aws_secretsmanager_secret.runtime[each.key].arn }],
    each.key != "notifications" ? [
      { Effect = "Allow", Action = ["sns:Publish"], Resource = aws_sns_topic.events.arn },
      { Effect = "Allow", Action = ["kms:Decrypt", "kms:GenerateDataKey*"], Resource = aws_kms_key.events.arn }
    ] : [],
    each.key != "operations" ? [{ Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"], Resource = aws_sqs_queue.work[each.key].arn }] : [],
    each.key == "documents" ? [{ Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject"], Resource = "${aws_s3_bucket.documents.arn}/orders/*" }] : []
  ) })
}
resource "aws_cloudwatch_metric_alarm" "dead_letters" {
  for_each            = local.queues
  alarm_name          = "${local.prefix}-${each.key}-dead-letters"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.dlq[each.key].name }
  alarm_description   = "Hay mensajes que requieren diagnóstico antes del redrive. Configura un destino de alertas en tu entorno."
}
output "topic_arn" { value = aws_sns_topic.events.arn }
output "queue_urls" { value = { for key, queue in aws_sqs_queue.work : key => queue.url } }
output "bucket_name" { value = aws_s3_bucket.documents.id }
output "secret_ids" { value = { for key, secret in aws_secretsmanager_secret.runtime : key => secret.arn } }
output "role_arns" { value = { for key, role in aws_iam_role.service : key => role.arn } }
