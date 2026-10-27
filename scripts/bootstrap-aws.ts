import { SNSClient, CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import {
  SQSClient,
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketEncryptionCommand,
  PutPublicAccessBlockCommand,
} from '@aws-sdk/client-s3';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { operationsDatabase } from '../apps/operations/src/app.js';
import { documentsDatabase } from '../apps/documents/src/app.js';
import { loadConfig } from '../packages/platform/src/config.js';
import { awsOptions } from '../packages/platform/src/config.js';
if (!process.env.AWS_ENDPOINT_URL)
  throw new Error(
    'Este script inicializa exclusivamente el emulador local. Usa Terraform para AWS.',
  );
const sns = new SNSClient(awsOptions());
const sqs = new SQSClient(awsOptions());
const s3 = new S3Client({ ...awsOptions(), forcePathStyle: true });
const secrets = new SecretsManagerClient(awsOptions());
try {
  const topic = await sns.send(new CreateTopicCommand({ Name: 'nexo-events' }));
  const topicArn = topic.TopicArn!;
  for (const name of ['documents', 'notifications']) {
    const dlq = await sqs.send(
      new CreateQueueCommand({
        QueueName: `nexo-${name}-dlq`,
        Attributes: { MessageRetentionPeriod: '1209600' },
      }),
    );
    const attrs = await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: dlq.QueueUrl, AttributeNames: ['QueueArn'] }),
    );
    const queue = await sqs.send(
      new CreateQueueCommand({
        QueueName: `nexo-${name}`,
        Attributes: {
          VisibilityTimeout: '60',
          ReceiveMessageWaitTimeSeconds: '10',
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: attrs.Attributes!.QueueArn,
            maxReceiveCount: 5,
          }),
        },
      }),
    );
    const queueAttrs = await sqs.send(
      new GetQueueAttributesCommand({ QueueUrl: queue.QueueUrl, AttributeNames: ['QueueArn'] }),
    );
    const queueArn = queueAttrs.Attributes!.QueueArn!;
    await sqs.send(
      new SetQueueAttributesCommand({
        QueueUrl: queue.QueueUrl,
        Attributes: {
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: 'sns.amazonaws.com' },
                Action: 'sqs:SendMessage',
                Resource: queueArn,
                Condition: { ArnEquals: { 'aws:SourceArn': topicArn } },
              },
            ],
          }),
        },
      }),
    );
    await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: 'sqs',
        Endpoint: queueArn,
        Attributes: {
          RawMessageDelivery: 'true',
          ...(name === 'documents'
            ? { FilterPolicy: JSON.stringify({ eventType: ['OrderConfirmed', 'OrderDispatched'] }) }
            : {}),
        },
      }),
    );
  }
  const bucket = process.env.S3_BUCKET ?? 'nexo-documents';
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  await s3.send(
    new PutBucketEncryptionCommand({
      Bucket: bucket,
      ServerSideEncryptionConfiguration: {
        Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
      },
    }),
  );
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: bucket,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    }),
  );
  const value = JSON.stringify({
    JWT_SECRET: process.env.JWT_SECRET,
    OPERATIONS_DATABASE_URL: process.env.OPERATIONS_DATABASE_URL,
    DOCUMENTS_DATABASE_URL: process.env.DOCUMENTS_DATABASE_URL,
    NOTIFICATIONS_DATABASE_URL: process.env.NOTIFICATIONS_DATABASE_URL,
  });
  const secretId = process.env.AWS_SECRET_ID ?? 'nexo/local';
  try {
    await secrets.send(new CreateSecretCommand({ Name: secretId, SecretString: value }));
  } catch (error) {
    if (error instanceof Error && error.name === 'ResourceExistsException')
      await secrets.send(new PutSecretValueCommand({ SecretId: secretId, SecretString: value }));
    else throw error;
  }
  for (const [name, open] of [
    ['operations', operationsDatabase],
    ['documents', documentsDatabase],
  ] as const) {
    const db = await open(await loadConfig(name));
    try {
      const [row] = await db.em
        .fork()
        .execute<{ table_name: string | null }[]>(
          "select to_regclass('public.outbox') as table_name",
        );
      if (row?.table_name)
        await db.em
          .fork()
          .execute(
            'update outbox set published_at=null,available_at=now(),locked_until=null,lease_id=null',
          );
    } finally {
      await db.close(true);
    }
  }
  console.log(
    'Infraestructura AWS local inicializada: topic, colas, DLQ, bucket privado y secretos.',
  );
} finally {
  sns.destroy();
  sqs.destroy();
  s3.destroy();
  secrets.destroy();
}
