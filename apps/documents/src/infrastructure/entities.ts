import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
export class DocumentRecord {
  id: string = randomUUID();
  orderId!: string;
  orderNumber!: string;
  customerId!: string;
  kind!: 'CONFIRMATION' | 'DISPATCH';
  objectKey!: string;
  fileName!: string;
  sizeBytes!: number;
  createdAt = new Date();
}
export const DocumentSchema = new EntitySchema<DocumentRecord>({
  class: DocumentRecord,
  tableName: 'documents',
  properties: {
    id: { type: 'uuid', primary: true },
    orderId: { type: 'uuid' },
    orderNumber: { type: 'string' },
    customerId: { type: 'uuid' },
    kind: { type: 'string' },
    objectKey: { type: 'string' },
    fileName: { type: 'string' },
    sizeBytes: { type: 'integer' },
    createdAt: { type: Date, columnType: 'timestamptz' },
  },
});
