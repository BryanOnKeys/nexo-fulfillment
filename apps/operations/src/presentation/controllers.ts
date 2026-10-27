import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Headers,
  Req,
  Res,
  HttpCode,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiBody, ApiHeader, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { Public, Roles, type AuthRequest } from '../../../../packages/platform/src/http.js';
import { CONFIG, type RuntimeConfig } from '../../../../packages/platform/src/config.js';
import { OrdersService } from '../application/orders.service.js';
import { CatalogService } from '../application/catalog.service.js';
import { IdentityService } from '../application/identity.service.js';
import {
  paginationSchema,
  customerSchema,
  productSchema,
  adjustmentSchema,
  createOrderSchema,
  transitionSchema,
  loginSchema,
  userSchema,
} from '../application/commands.js';
import { orderStatusSchema } from '../../../../packages/contracts/src/events.js';
const context = (req: AuthRequest) => ({ actor: req.actor, correlationId: req.requestId });
function schemaBody(schema: z.ZodType) {
  return ApiBody({ schema: z.toJSONSchema(schema, { target: 'openapi-3.0' }) as never });
}
@ApiTags('Sesiones')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly identity: IdentityService,
    @Inject(CONFIG) private readonly config: RuntimeConfig,
  ) {}
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @schemaBody(loginSchema)
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const input = loginSchema.parse(body);
    const result = await this.identity.login(input.email, input.password);
    this.cookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.identity.refresh(
      z.string().max(250).parse(req.cookies?.nexo_refresh),
    );
    this.cookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response) {
    await this.identity.logout(req.cookies?.nexo_refresh as string | undefined);
    res.clearCookie('nexo_refresh', {
      path: '/api/v1/auth',
      sameSite: 'strict',
      secure: this.config.NODE_ENV === 'production',
    });
  }
  @Get('me') @ApiBearerAuth() me(@Req() req: AuthRequest) {
    return this.identity.me(req.actor.sub);
  }
  private cookie(res: Response, value: string) {
    res.cookie('nexo_refresh', value, {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 7 * 86_400_000,
    });
  }
}
@ApiTags('Pedidos')
@ApiBearerAuth()
@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@Query() query: unknown, @Req() req: AuthRequest) {
    const input = paginationSchema.extend({ status: orderStatusSchema.optional() }).parse(query);
    return this.orders.list(input, context(req));
  }
  @Get(':id') detail(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: AuthRequest) {
    return this.orders.detail(id, context(req));
  }
  @Post()
  @Roles('ADMIN', 'SALES', 'CUSTOMER')
  @schemaBody(createOrderSchema)
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID o cadena única por intento lógico; reutilízala al reintentar.',
  })
  @ApiOperation({ summary: 'Crear un pedido y reservar existencias de forma atómica' })
  create(@Body() body: unknown, @Headers('idempotency-key') key: unknown, @Req() req: AuthRequest) {
    return this.orders.create(
      createOrderSchema.parse(body),
      z
        .string()
        .min(8)
        .max(100)
        .regex(/^[A-Za-z0-9_-]+$/)
        .parse(key),
      context(req),
    );
  }
  @Patch(':id/status')
  @Roles('ADMIN', 'WAREHOUSE', 'SALES')
  @schemaBody(transitionSchema)
  transition(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.orders.transition(id, transitionSchema.parse(body), context(req));
  }
}
@ApiTags('Catálogo e inventario')
@ApiBearerAuth()
@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly catalog: CatalogService) {}
  @Get() list(@Query() query: unknown) {
    return this.catalog.products(paginationSchema.parse(query));
  }
  @Post() @Roles('ADMIN', 'SALES') @schemaBody(productSchema) create(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.saveProduct(productSchema.parse(body), context(req));
  }
  @Patch(':id') @Roles('ADMIN', 'SALES') @schemaBody(productSchema) update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.saveProduct(productSchema.parse(body), context(req), id);
  }
  @Post(':id/adjustments') @Roles('ADMIN', 'WAREHOUSE') @schemaBody(adjustmentSchema) adjust(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    const input = adjustmentSchema.parse(body);
    return this.catalog.adjust(id, input.delta, input.reason, context(req));
  }
  @Get(':id/movements') @Roles('ADMIN', 'WAREHOUSE', 'SALES') movements(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.catalog.movements(id);
  }
}
@ApiTags('Clientes')
@ApiBearerAuth()
@Controller('api/v1/customers')
export class CustomersController {
  constructor(private readonly catalog: CatalogService) {}
  @Get() list(@Query() query: unknown, @Req() req: AuthRequest) {
    return this.catalog.customers(paginationSchema.parse(query), context(req));
  }
  @Post() @Roles('ADMIN', 'SALES') @schemaBody(customerSchema) create(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.saveCustomer(customerSchema.parse(body), context(req));
  }
  @Patch(':id') @Roles('ADMIN', 'SALES') @schemaBody(customerSchema) update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.saveCustomer(customerSchema.parse(body), context(req), id);
  }
}
@ApiTags('Administración')
@ApiBearerAuth()
@Controller('api/v1')
export class AdministrationController {
  constructor(private readonly catalog: CatalogService) {}
  @Get('dashboard') dashboard(@Req() req: AuthRequest) {
    return this.catalog.dashboard(context(req));
  }
  @Get('users') @Roles('ADMIN') users() {
    return this.catalog.users();
  }
  @Post('users') @Roles('ADMIN') @schemaBody(userSchema) createUser(
    @Body() body: unknown,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.createUser(userSchema.parse(body), context(req));
  }
  @Get('audit') @Roles('ADMIN') audit(@Query('page') page: unknown) {
    return this.catalog.auditLog(z.coerce.number().int().positive().default(1).parse(page));
  }
}
