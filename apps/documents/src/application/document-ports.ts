import type { OrderEvent } from '../../../../packages/contracts/src/events.js';
export const DOCUMENT_RENDERER = Symbol('DOCUMENT_RENDERER');
export const DOCUMENT_STORAGE = Symbol('DOCUMENT_STORAGE');
export interface DocumentRenderer {
  render(event: OrderEvent): Promise<Buffer>;
}
export interface DocumentStorage {
  exists(key: string): Promise<boolean>;
  put(key: string, body: Buffer): Promise<void>;
  signedDownload(key: string, fileName: string): Promise<string>;
}
