import { Controller, Get, Param, Query, Req, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthRequest } from '../../../../packages/platform/src/http.js';
import { DocumentsService } from '../application/documents.service.js';
@ApiTags('Documentos')
@ApiBearerAuth()
@Controller('api/v1/documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Get() list(@Query() query: unknown, @Req() req: AuthRequest) {
    return this.documents.list(
      z
        .object({
          page: z.coerce.number().int().min(1).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(20),
          orderId: z.uuid().optional(),
        })
        .parse(query),
      req.actor,
    );
  }
  @Get(':id/download') download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.documents.download(id, req.actor);
  }
}
