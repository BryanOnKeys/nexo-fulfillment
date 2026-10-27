import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  awsOptions,
  CONFIG,
  type RuntimeConfig,
} from '../../../../packages/platform/src/config.js';
import type { DocumentStorage } from '../application/document-ports.js';
@Injectable()
export class S3Storage implements DocumentStorage, OnModuleDestroy {
  private readonly client = new S3Client({
    ...awsOptions(),
    forcePathStyle: !!process.env.AWS_ENDPOINT_URL,
  });
  constructor(@Inject(CONFIG) private readonly config: RuntimeConfig) {}
  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.config.S3_BUCKET, Key: key }));
      return true;
    } catch (error) {
      if (error instanceof Error && ['NotFound', 'NoSuchKey'].includes(error.name)) return false;
      throw error;
    }
  }
  async put(key: string, body: Buffer) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'AES256',
      }),
    );
  }
  async signedDownload(key: string, fileName: string) {
    const signer = this.config.S3_PUBLIC_ENDPOINT
      ? new S3Client({
          ...awsOptions(),
          endpoint: this.config.S3_PUBLIC_ENDPOINT,
          forcePathStyle: true,
        })
      : this.client;
    try {
      return await getSignedUrl(
        signer,
        new GetObjectCommand({
          Bucket: this.config.S3_BUCKET,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${fileName}"`,
          ResponseContentType: 'application/pdf',
        }),
        { expiresIn: 120 },
      );
    } finally {
      if (signer !== this.client) signer.destroy();
    }
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
