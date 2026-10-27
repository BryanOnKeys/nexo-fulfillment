import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { loadConfig, type RuntimeConfig } from '../../../packages/platform/src/config.js';
import { openDatabase } from '../../../packages/platform/src/persistence.js';
import { PlatformModule } from '../../../packages/platform/src/platform.module.js';
import { configureHttp } from '../../../packages/platform/src/http.js';
import { OutboxPublisher } from '../../../packages/platform/src/messaging.js';
import { DocumentSchema } from './infrastructure/entities.js';
import { Migration202610270002 } from './migrations/Migration202610270002.js';
import { DocumentsService } from './application/documents.service.js';
import { DOCUMENT_RENDERER, DOCUMENT_STORAGE } from './application/document-ports.js';
import { PdfRenderer } from './infrastructure/pdf.renderer.js';
import { S3Storage } from './infrastructure/s3.storage.js';
import { DocumentsConsumer } from './infrastructure/documents.consumer.js';
import { DocumentsController } from './presentation/documents.controller.js';
export function documentsDatabase(config: RuntimeConfig) {
  return openDatabase(
    config,
    [DocumentSchema],
    [{ name: 'Migration202610270002', class: Migration202610270002 }],
  );
}
export async function createDocumentsApp(config?: RuntimeConfig) {
  const runtime = config ?? (await loadConfig('documents'));
  const db = await documentsDatabase(runtime);
  @Module({
    imports: [PlatformModule.register(runtime, db)],
    controllers: [DocumentsController],
    providers: [
      DocumentsService,
      DocumentsConsumer,
      OutboxPublisher,
      { provide: DOCUMENT_RENDERER, useClass: PdfRenderer },
      { provide: DOCUMENT_STORAGE, useClass: S3Storage },
    ],
  })
  class DocumentsModule {}
  const app = await NestFactory.create(DocumentsModule, {
    logger: runtime.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  configureHttp(app, runtime);
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('NEXO · Documentos')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    ),
  );
  return app;
}
