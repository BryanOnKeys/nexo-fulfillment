import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { loadConfig, type RuntimeConfig } from '../../../packages/platform/src/config.js';
import { openDatabase } from '../../../packages/platform/src/persistence.js';
import { PlatformModule } from '../../../packages/platform/src/platform.module.js';
import { configureHttp } from '../../../packages/platform/src/http.js';
import { NotificationSchema, NotificationReadSchema } from './infrastructure/entities.js';
import { Migration202610270003 } from './migrations/Migration202610270003.js';
import { LiveGateway } from './presentation/live.gateway.js';
import { NotificationsController } from './presentation/notifications.controller.js';
import { NOTIFICATION_PUBLISHER } from './application/notification-publisher.js';
import { NotificationsService } from './application/notifications.service.js';
import { NotificationsConsumer } from './infrastructure/notifications.consumer.js';
export function notificationsDatabase(config: RuntimeConfig) {
  return openDatabase(
    config,
    [NotificationSchema, NotificationReadSchema],
    [{ name: 'Migration202610270003', class: Migration202610270003 }],
  );
}
export async function createNotificationsApp(config?: RuntimeConfig) {
  const runtime = config ?? (await loadConfig('notifications'));
  const db = await notificationsDatabase(runtime);
  @Module({
    imports: [PlatformModule.register(runtime, db)],
    controllers: [NotificationsController],
    providers: [
      LiveGateway,
      { provide: NOTIFICATION_PUBLISHER, useExisting: LiveGateway },
      NotificationsService,
      NotificationsConsumer,
    ],
  })
  class NotificationsModule {}
  const app = await NestFactory.create(NotificationsModule, {
    logger: runtime.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
  });
  configureHttp(app, runtime);
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('NEXO · Notificaciones')
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    ),
  );
  return app;
}
