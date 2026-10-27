import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';
import { integrationEventSchema, type IntegrationEvent } from '../../contracts/src/events.js';
import { awsOptions, CONFIG, type RuntimeConfig } from './config.js';
import { DATABASE, type Database } from './persistence.js';

@Injectable()
export class OutboxPublisher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('outbox');
  private readonly client = new SNSClient({ ...awsOptions(), maxAttempts: 3 });
  private readonly abort = new AbortController();
  private running?: Promise<void>;
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CONFIG) private readonly config: RuntimeConfig,
  ) {}
  onModuleInit() {
    if (this.config.ENABLE_WORKERS === 'true') this.running = this.loop();
  }
  async onModuleDestroy() {
    this.abort.abort();
    await this.running;
    this.client.destroy();
  }
  private async loop() {
    while (!this.abort.signal.aborted) {
      try {
        const count = await this.publishBatch();
        if (!count) await delay(700, undefined, { signal: this.abort.signal });
      } catch (error) {
        if (!this.abort.signal.aborted) {
          this.logger.error(
            JSON.stringify({
              event: 'outbox.failure',
              error: error instanceof Error ? error.name : 'unknown',
            }),
          );
          await delay(1500, undefined, { signal: this.abort.signal }).catch(() => undefined);
        }
      }
    }
  }
  async publishBatch(): Promise<number> {
    const em = this.db.em.fork();
    const lease = randomUUID();
    const rows = await em.execute<{ id: string; event: IntegrationEvent; attempts: number }[]>(
      `
      update outbox set lease_id = ?, locked_until = now() + interval '180 seconds', attempts = attempts + 1
      where id in (select id from outbox where published_at is null and available_at <= now()
        and (locked_until is null or locked_until < now()) order by created_at limit 10 for update skip locked)
      returning id, event, attempts`,
      [lease],
    );
    for (const row of rows) {
      try {
        const event = integrationEventSchema.parse(row.event);
        await this.client.send(
          new PublishCommand({
            TopicArn: this.config.SNS_TOPIC_ARN,
            Message: JSON.stringify(event),
            MessageAttributes: { eventType: { DataType: 'String', StringValue: event.type } },
          }),
          { abortSignal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(15_000)]) },
        );
        await em.execute(
          'update outbox set published_at = now(), locked_until = null, lease_id = null, last_error = null where id = ? and lease_id = ?',
          [row.id, lease],
        );
      } catch (error) {
        const backoff = Math.min(300, 2 ** Math.min(row.attempts, 8));
        await em.execute(
          "update outbox set locked_until = null, lease_id = null, available_at = now() + (? * interval '1 second'), last_error = ? where id = ? and lease_id = ?",
          [backoff, error instanceof Error ? error.name : 'unknown', row.id, lease],
        );
        this.logger.warn(
          JSON.stringify({ event: 'outbox.retry', eventId: row.id, attempts: row.attempts }),
        );
      }
    }
    return rows.length;
  }
}
export abstract class QueueConsumer implements OnModuleInit, OnModuleDestroy {
  protected readonly logger = new Logger('consumer');
  private readonly sqs = new SQSClient({ ...awsOptions(), maxAttempts: 3 });
  private readonly abort = new AbortController();
  private running?: Promise<void>;
  constructor(
    protected readonly queueUrl: string,
    protected readonly enabled: boolean,
  ) {}
  protected abstract handle(event: IntegrationEvent): Promise<void>;
  onModuleInit() {
    if (this.enabled) this.running = this.loop();
  }
  async onModuleDestroy() {
    this.abort.abort();
    await this.running;
    this.sqs.destroy();
  }
  private async loop() {
    while (!this.abort.signal.aborted) {
      try {
        const response = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: this.queueUrl,
            WaitTimeSeconds: 10,
            MaxNumberOfMessages: 1,
            VisibilityTimeout: 60,
            MessageSystemAttributeNames: ['ApproximateReceiveCount'],
          }),
          { abortSignal: this.abort.signal },
        );
        for (const message of response.Messages ?? []) {
          const heartbeat = setInterval(() => {
            void this.sqs
              .send(
                new ChangeMessageVisibilityCommand({
                  QueueUrl: this.queueUrl,
                  ReceiptHandle: message.ReceiptHandle,
                  VisibilityTimeout: 60,
                }),
              )
              .catch(() => undefined);
          }, 20_000);
          try {
            const event = integrationEventSchema.parse(JSON.parse(message.Body ?? '{}'));
            await this.handle(event);
            await this.sqs.send(
              new DeleteMessageCommand({
                QueueUrl: this.queueUrl,
                ReceiptHandle: message.ReceiptHandle,
              }),
            );
          } catch (error) {
            this.logger.warn(
              JSON.stringify({
                event: 'consumer.retry',
                messageId: message.MessageId,
                error: error instanceof Error ? error.name : 'unknown',
                receiveCount: message.Attributes?.ApproximateReceiveCount,
              }),
            );
          } finally {
            clearInterval(heartbeat);
          }
        }
      } catch (error) {
        if (!this.abort.signal.aborted) {
          this.logger.error(
            JSON.stringify({
              event: 'consumer.failure',
              error: error instanceof Error ? error.name : 'unknown',
            }),
          );
          await delay(1000, undefined, { signal: this.abort.signal }).catch(() => undefined);
        }
      }
    }
  }
}
