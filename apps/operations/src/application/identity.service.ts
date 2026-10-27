import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { LockMode } from '@mikro-orm/core';
import { DATABASE, type Database } from '../../../../packages/platform/src/persistence.js';
import {
  hashPassword,
  verifyPassword,
  digest,
} from '../../../../packages/platform/src/security.js';
import { invariant } from '../../../../packages/platform/src/errors.js';
import { UserRecord, SessionRecord } from '../infrastructure/entities.js';
export function publicUser(user: UserRecord) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    customerId: user.customerId,
    active: user.active,
  };
}
@Injectable()
export class IdentityService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jwt: JwtService,
  ) {}
  async login(email: string, password: string) {
    const em = this.db.em.fork();
    const user = await em.findOne(UserRecord, { email: email.toLowerCase() });
    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : (await hashPassword(password), false);
    invariant(
      user && valid && user.active,
      'INVALID_CREDENTIALS',
      'Correo o contraseña incorrectos.',
      401,
    );
    const session = Object.assign(new SessionRecord(), {
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
    const refreshToken = `${session.id}.${randomBytes(48).toString('base64url')}`;
    session.tokenHash = digest(refreshToken);
    em.persist(session);
    await em.flush();
    return { accessToken: this.token(user, session.id), refreshToken, user: publicUser(user) };
  }
  async refresh(refreshToken: string) {
    const id = refreshToken.split('.')[0];
    invariant(id && /^[0-9a-f-]{36}$/i.test(id), 'INVALID_SESSION', 'La sesión ha caducado.', 401);
    const result = await this.db.em.fork().transactional(async (em) => {
      const session = await em.findOne(
        SessionRecord,
        { id },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;
      if (session.tokenHash !== digest(refreshToken)) {
        session.revokedAt = new Date();
        return null;
      }
      const user = await em.findOne(UserRecord, { id: session.userId, active: true });
      if (!user) {
        session.revokedAt = new Date();
        return null;
      }
      const rotated = `${session.id}.${randomBytes(48).toString('base64url')}`;
      session.tokenHash = digest(rotated);
      return {
        accessToken: this.token(user, session.id),
        refreshToken: rotated,
        user: publicUser(user),
      };
    });
    invariant(result, 'INVALID_SESSION', 'La sesión ha caducado. Inicia sesión nuevamente.', 401);
    return result;
  }
  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    const id = refreshToken.split('.')[0];
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    await this.db.em
      .fork()
      .nativeUpdate(
        SessionRecord,
        { id, tokenHash: digest(refreshToken) },
        { revokedAt: new Date() },
      );
  }
  async me(id: string) {
    const user = await this.db.em.fork().findOne(UserRecord, { id, active: true });
    invariant(user, 'INVALID_SESSION', 'Usuario no disponible.', 401);
    return publicUser(user);
  }
  private token(user: UserRecord, sessionId: string) {
    return this.jwt.sign({
      sub: user.id,
      name: user.name,
      role: user.role,
      customerId: user.customerId,
      sessionId,
    });
  }
}
