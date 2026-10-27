import {
  DynamicModule,
  Global,
  Module,
  Injectable,
  Inject,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CONFIG, type RuntimeConfig } from './config.js';
import { DATABASE, type Database } from './persistence.js';
import { AccessGuard, HealthController } from './http.js';
@Injectable()
class CloseDatabase implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async onApplicationShutdown() {
    await this.db.close(true);
  }
}
@Global()
@Module({})
export class PlatformModule {
  static register(config: RuntimeConfig, db: Database): DynamicModule {
    return {
      module: PlatformModule,
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: config.NODE_ENV === 'test' ? 10000 : 120 }]),
      ],
      controllers: [HealthController],
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: DATABASE, useValue: db },
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: config.JWT_SECRET,
            signOptions: {
              issuer: 'nexo',
              audience: 'nexo-services',
              algorithm: 'HS256',
              expiresIn: '15m',
            },
          }),
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AccessGuard },
        CloseDatabase,
      ],
      exports: [CONFIG, DATABASE, JwtService],
    };
  }
}
