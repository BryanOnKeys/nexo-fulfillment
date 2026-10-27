import { Inject, Injectable } from '@nestjs/common';
import { QueueConsumer } from '../../../../packages/platform/src/messaging.js';
import { CONFIG, type RuntimeConfig } from '../../../../packages/platform/src/config.js';
import type { IntegrationEvent } from '../../../../packages/contracts/src/events.js';
import { DocumentsService } from '../application/documents.service.js';
@Injectable()
export class DocumentsConsumer extends QueueConsumer {
  constructor(
    @Inject(CONFIG) config: RuntimeConfig,
    private readonly documents: DocumentsService,
  ) {
    super(config.DOCUMENTS_QUEUE_URL, config.ENABLE_WORKERS === 'true');
  }
  protected async handle(event: IntegrationEvent) {
    await this.documents.consume(event);
  }
}
