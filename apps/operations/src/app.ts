import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { loadConfig, type RuntimeConfig } from '../../../packages/platform/src/config.js';
import { openDatabase } from '../../../packages/platform/src/persistence.js';
import { PlatformModule } from '../../../packages/platform/src/platform.module.js';
import { configureHttp } from '../../../packages/platform/src/http.js';
import { OutboxPublisher } from '../../../packages/platform/src/messaging.js';
import { operationEntities } from './infrastructure/entities.js';
import { Migration202610270001 } from './migrations/Migration202610270001.js';
import { ORDER_STORE } from './application/order-store.js';
import { MikroOrderStore } from './infrastructure/mikro-order.store.js';
import { OrdersService } from './application/orders.service.js';
import { IdentityService } from './application/identity.service.js';
import { CatalogService } from './application/catalog.service.js';
import {
  AuthController,
  OrdersController,
  ProductsController,
  CustomersController,
  AdministrationController,
} from './presentation/controllers.js';
export async function operationsDatabase(config: RuntimeConfig) {
  return openDatabase(config, operationEntities, [
    { name: 'Migration202610270001', class: Migration202610270001 },
  ]);
}
export async function createOperationsApp(config?: RuntimeConfig) {
  const runtime = config ?? (await loadConfig('operations'));
  const db = await operationsDatabase(runtime);
  @Module({
    imports: [PlatformModule.register(runtime, db)],
    controllers: [
      AuthController,
      OrdersController,
      ProductsController,
      CustomersController,
      AdministrationController,
    ],
    providers: [
      OrdersService,
      IdentityService,
      CatalogService,
      { provide: ORDER_STORE, useClass: MikroOrderStore },
      OutboxPublisher,
    ],
  })
  class OperationsModule {}
  const app = await NestFactory.create(OperationsModule, {
    logger: runtime.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'],
    bodyParser: true,
  });
  configureHttp(app, runtime);
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('NEXO · Operaciones')
      .setDescription(
        'Pedidos, inventario, clientes y seguridad. Importes expresados en céntimos PEN.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
  return app;
}
