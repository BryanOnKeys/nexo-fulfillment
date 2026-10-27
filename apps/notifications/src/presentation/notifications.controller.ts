import { Controller, Get, Post, Param, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthRequest } from '../../../../packages/platform/src/http.js';
import { NotificationsService } from '../application/notifications.service.js';
@ApiTags('Notificaciones')
@ApiBearerAuth()
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Get() list(@Query() query: unknown, @Req() req: AuthRequest) {
    const p = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(query);
    return this.notifications.list(p.page, p.pageSize, req.actor);
  }
  @Post('read-all') all(@Req() req: AuthRequest) {
    return this.notifications.markAllRead(req.actor);
  }
  @Post(':id/read') read(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: AuthRequest) {
    return this.notifications.markRead(id, req.actor);
  }
}
