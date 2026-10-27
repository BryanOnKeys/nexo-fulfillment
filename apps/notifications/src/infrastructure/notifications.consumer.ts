import { Inject, Injectable } from '@nestjs/common';
import { QueueConsumer } from '../../../../packages/platform/src/messaging.js';
import { CONFIG, type RuntimeConfig } from '../../../../packages/platform/src/config.js';
import type { IntegrationEvent } from '../../../../packages/contracts/src/events.js';
import { NotificationsService } from '../application/notifications.service.js';
@Injectable()
export class NotificationsConsumer extends QueueConsumer {
  constructor(
    @Inject(CONFIG) config: RuntimeConfig,
    private readonly notifications: NotificationsService,
  ) {
    super(config.NOTIFICATIONS_QUEUE_URL, config.ENABLE_WORKERS === 'true');
  }
  protected async handle(event: IntegrationEvent) {
    await this.notifications.consume(event);
  }
}
