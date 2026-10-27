import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, outbox, type Database } from '../../../../packages/platform/src/persistence.js';
import { invariant } from '../../../../packages/platform/src/errors.js';
import type {
  AccessClaims,
  IntegrationEvent,
  OrderEvent,
} from '../../../../packages/contracts/src/events.js';
import {
  DOCUMENT_RENDERER,
  DOCUMENT_STORAGE,
  type DocumentRenderer,
  type DocumentStorage,
} from './document-ports.js';
import { DocumentRecord } from '../infrastructure/entities.js';
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(DOCUMENT_RENDERER) private readonly renderer: DocumentRenderer,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
  ) {}
  async consume(event: IntegrationEvent) {
    if (event.type !== 'OrderConfirmed' && event.type !== 'OrderDispatched') return;
    const existing = await this.db.em.fork().findOne(DocumentRecord, { id: event.id });
    if (existing && (await this.storage.exists(existing.objectKey))) return;
    const orderEvent = event as OrderEvent;
    const kind = event.type === 'OrderDispatched' ? 'DISPATCH' : 'CONFIRMATION';
    // Una clave determinista hace seguro reintentar la escritura externa si el commit falla.
    const objectKey = `orders/${event.data.id}/${kind.toLowerCase()}.pdf`;
    const fileName = `${event.data.number}-${kind === 'DISPATCH' ? 'despacho' : 'pedido'}.pdf`;
    const body = await this.renderer.render(orderEvent);
    await this.storage.put(objectKey, body);
    if (existing) return;
    await this.db.em.fork().transactional(async (em) => {
      const claimed = await em.execute<{ id: string }[]>(
        'insert into inbox(id) values (?) on conflict do nothing returning id',
        [event.id],
      );
      if (!claimed.length) return;
      em.persist(
        Object.assign(new DocumentRecord(), {
          id: event.id,
          orderId: event.data.id,
          orderNumber: event.data.number,
          customerId: event.data.customerId,
          kind,
          objectKey,
          fileName,
          sizeBytes: body.length,
        }),
      );
      em.persist(
        outbox({
          id: randomUUID(),
          schemaVersion: 1,
          type: 'DocumentGenerated',
          occurredAt: new Date().toISOString(),
          correlationId: event.correlationId,
          data: {
            orderId: event.data.id,
            orderNumber: event.data.number,
            customerId: event.data.customerId,
            documentId: event.id,
            kind,
          },
        }),
      );
    });
  }
  async list(input: { page: number; pageSize: number; orderId?: string }, actor: AccessClaims) {
    const where = {
      ...(input.orderId ? { orderId: input.orderId } : {}),
      ...(actor.role === 'CUSTOMER' ? { customerId: actor.customerId! } : {}),
    };
    const [documents, total] = await this.db.em.fork().findAndCount(DocumentRecord, where, {
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: documents.map(({ objectKey, ...doc }) => doc),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async download(id: string, actor: AccessClaims) {
    const doc = await this.db.em.fork().findOne(DocumentRecord, {
      id,
      ...(actor.role === 'CUSTOMER' ? { customerId: actor.customerId! } : {}),
    });
    invariant(doc, 'DOCUMENT_NOT_FOUND', 'Documento no encontrado.', 404);
    return { url: await this.storage.signedDownload(doc.objectKey, doc.fileName), expiresIn: 120 };
  }
}
