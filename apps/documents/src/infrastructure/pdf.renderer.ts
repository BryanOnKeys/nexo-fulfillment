import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type { OrderEvent } from '../../../../packages/contracts/src/events.js';
import type { DocumentRenderer } from '../application/document-ports.js';
@Injectable()
export class PdfRenderer implements DocumentRenderer {
  async render(event: OrderEvent): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdf = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: `NEXO · ${event.data.number}`, Author: 'NEXO' },
      });
      const chunks: Buffer[] = [];
      pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
      const order = event.data;
      const money = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;
      const heading =
        event.type === 'OrderDispatched' ? 'ORDEN DE DESPACHO' : 'CONFIRMACIÓN DE PEDIDO';
      pdf.font('Helvetica-Bold').fontSize(30).fillColor('#163c35').text('NEXO');
      pdf.fontSize(10).fillColor('#53645e').text('OPERACIONES CONECTADAS');
      pdf.moveDown(2);
      pdf.font('Helvetica-Bold').fontSize(19).fillColor('#132b26').text(heading);
      pdf.font('Helvetica').fontSize(11).text(order.number);
      pdf.moveDown();
      pdf.font('Helvetica-Bold').text('Cliente');
      pdf.font('Helvetica').text(order.customerName);
      pdf.moveDown(0.5);
      pdf.font('Helvetica-Bold').text('Dirección de entrega');
      pdf.font('Helvetica').text(order.deliveryAddress);
      pdf.moveDown(0.5);
      pdf.text(
        `Fecha: ${new Date(event.occurredAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}`,
      );
      pdf.moveDown(1.5);
      const tableHeader = () => {
        const y = pdf.y;
        pdf.rect(48, y, 499, 24).fill('#e9f2ed');
        pdf
          .fillColor('#163c35')
          .font('Helvetica-Bold')
          .fontSize(9)
          .text('PRODUCTO', 58, y + 8, { width: 260 })
          .text('CANT.', 320, y + 8, { width: 45, align: 'right' })
          .text('P. UNIT.', 377, y + 8, { width: 70, align: 'right' })
          .text('IMPORTE', 455, y + 8, { width: 82, align: 'right' });
        pdf.y = y + 34;
      };
      tableHeader();
      for (const item of order.items) {
        const line = `${item.name} (${item.sku})`;
        const height = Math.max(
          35,
          pdf.font('Helvetica').fontSize(10).heightOfString(line, { width: 250 }) + 16,
        );
        if (pdf.y + height > 730) {
          pdf.addPage();
          tableHeader();
        }
        const y = pdf.y;
        pdf
          .font('Helvetica')
          .fillColor('#263d36')
          .fontSize(10)
          .text(line, 58, y, { width: 250 })
          .text(String(item.quantity), 320, y, { width: 45, align: 'right' })
          .text(money(item.unitPriceCents), 377, y, { width: 70, align: 'right' })
          .text(money(item.unitPriceCents * item.quantity), 455, y, { width: 82, align: 'right' });
        pdf
          .moveTo(48, y + height - 8)
          .lineTo(547, y + height - 8)
          .strokeColor('#e2e9e4')
          .stroke();
        pdf.y = y + height;
      }
      if (pdf.y > 670) pdf.addPage();
      pdf.moveDown();
      pdf
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(`TOTAL ${money(order.totalCents)}`, 48, pdf.y, { width: 499, align: 'right' });
      pdf.moveDown(2);
      pdf
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#687b72')
        .text(
          'Documento interno de operación. No constituye un comprobante de pago tributario.',
          48,
          pdf.y,
          { width: 499 },
        );
      pdf.end();
    });
  }
}
