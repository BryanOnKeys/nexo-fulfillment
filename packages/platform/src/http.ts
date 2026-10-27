import { randomUUID } from 'node:crypto';
import {
  Catch,
  Controller,
  Get,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
  Logger,
  type ArgumentsHost,
  type CanActivate,
  type ExecutionContext,
  type ExceptionFilter,
  type INestApplication,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError, z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { accessClaimsSchema, type AccessClaims, type Role } from '../../contracts/src/events.js';
import { CONFIG, type RuntimeConfig } from './config.js';
import { DATABASE, type Database } from './persistence.js';
import { BusinessError } from './errors.js';

export type AuthRequest = Request & { actor: AccessClaims; requestId: string };
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export function verifyAccess(jwt: JwtService, token: string): AccessClaims {
  try {
    return accessClaimsSchema.parse(
      jwt.verify(token, { issuer: 'nexo', audience: 'nexo-services', algorithms: ['HS256'] }),
    );
  } catch {
    throw new UnauthorizedException('La sesión no es válida o ha caducado.');
  }
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}
  canActivate(context: ExecutionContext): boolean {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Inicia sesión para continuar.');
    request.actor = verifyAccess(this.jwt, token);
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(request.actor.role))
      throw new ForbiddenException('No tienes permiso para esta operación.');
    return true;
  }
}
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('http');
  catch(error: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<AuthRequest>();
    const res = ctx.getResponse<Response>();
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'No se pudo completar la operación.';
    let details: unknown;
    if (error instanceof BusinessError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 422;
      code = 'VALIDATION_ERROR';
      message = 'Revisa los datos enviados.';
      details = error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      code = `HTTP_${status}`;
      message = error.message;
    } else if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      status = 409;
      code = 'ALREADY_EXISTS';
      message = 'Ya existe un registro con esos datos.';
    }
    if (status >= 500)
      this.logger.error(
        JSON.stringify({
          event: 'request.failed',
          requestId: req.requestId,
          error: error instanceof Error ? error.name : 'unknown',
        }),
      );
    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `urn:nexo:error:${code.toLowerCase()}`,
        title: message,
        status,
        code,
        requestId: req.requestId,
        ...(details ? { details } : {}),
      });
  }
}
@Controller()
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CONFIG) private readonly config: RuntimeConfig,
  ) {}
  @Public() @Get('/health') health() {
    return { status: 'ok', service: this.config.service };
  }
  @Public() @Get('/ready') async ready() {
    await this.db.em.fork().execute('select 1');
    return { status: 'ready' };
  }
}
export function configureHttp(app: INestApplication, config: RuntimeConfig) {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
  });
  app.use((req: AuthRequest, res: Response, next: NextFunction) => {
    const incoming = req.headers['x-request-id'];
    req.requestId =
      typeof incoming === 'string' && z.uuid().safeParse(incoming).success
        ? incoming
        : randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    const start = performance.now();
    res.on('finish', () => {
      if (req.path !== '/health')
        console.log(
          JSON.stringify({
            level: 'info',
            service: config.service,
            event: 'http.request',
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Math.round(performance.now() - start),
            requestId: req.requestId,
          }),
        );
    });
    next();
  });
  app.useGlobalFilters(new ProblemFilter());
  app.enableShutdownHooks();
}
export { ApiBearerAuth };
