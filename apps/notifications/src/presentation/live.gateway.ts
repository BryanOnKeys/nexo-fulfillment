import {
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import { verifyAccess } from '../../../../packages/platform/src/http.js';
import type { NotificationRecord } from '../infrastructure/entities.js';
@WebSocketGateway({
  namespace: '/live',
  cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', credentials: true },
  maxHttpBufferSize: 16_384,
})
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;
  private readonly expiry = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly jwt: JwtService) {}
  async handleConnection(client: Socket) {
    try {
      const token: unknown = client.handshake.auth.token;
      if (typeof token !== 'string') throw new Error('unauthorized');
      const actor = verifyAccess(this.jwt, token);
      client.data.actor = actor;
      await client.join(actor.role === 'CUSTOMER' ? `customer:${actor.customerId}` : 'staff');
      const timer = setTimeout(
        () => client.disconnect(true),
        Math.max(1, actor.exp * 1000 - Date.now()),
      );
      timer.unref();
      this.expiry.set(client.id, timer);
      client.emit('session.ready', { connected: true });
    } catch {
      client.emit('session.error', { message: 'La sesión no es válida.' });
      client.disconnect(true);
    }
  }
  handleDisconnect(client: Socket) {
    const timer = this.expiry.get(client.id);
    if (timer) clearTimeout(timer);
    this.expiry.delete(client.id);
  }
  publish(notification: NotificationRecord) {
    this.server
      .to('staff')
      .to(`customer:${notification.customerId}`)
      .emit('notification.created', notification);
  }
}
