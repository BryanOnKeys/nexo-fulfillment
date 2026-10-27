import { z } from 'zod';
z.config(z.locales.es());
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

export type ServiceName = 'operations' | 'documents' | 'notifications';
export const CONFIG = Symbol('CONFIG');
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(48),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ENDPOINT_URL: z.string().url().optional(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(3).default('nexo-documents'),
  SNS_TOPIC_ARN: z.string().default('arn:aws:sns:us-east-1:123456789012:nexo-events'),
  DOCUMENTS_QUEUE_URL: z
    .string()
    .url()
    .default('http://localhost:5000/123456789012/nexo-documents'),
  NOTIFICATIONS_QUEUE_URL: z
    .string()
    .url()
    .default('http://localhost:5000/123456789012/nexo-notifications'),
  ENABLE_WORKERS: z.enum(['true', 'false']).default('true'),
});
export type RuntimeConfig = z.infer<typeof envSchema> & {
  databaseUrl: string;
  service: ServiceName;
  port: number;
};
export function awsOptions() {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  return {
    region: process.env.AWS_REGION ?? 'us-east-1',
    ...(endpoint
      ? { endpoint, credentials: { accessKeyId: 'local', secretAccessKey: 'local' } }
      : {}),
  };
}
export async function loadConfig(service: ServiceName): Promise<RuntimeConfig> {
  if (process.env.NODE_ENV === 'production' && process.env.AWS_ENDPOINT_URL) {
    throw new Error('AWS_ENDPOINT_URL solo se permite para desarrollo o pruebas.');
  }
  const source = { ...process.env };
  if (source.AWS_SECRET_ID) {
    const client = new SecretsManagerClient(awsOptions());
    try {
      const response = await client.send(
        new GetSecretValueCommand({ SecretId: source.AWS_SECRET_ID }),
      );
      const secret = z
        .object({
          JWT_SECRET: z.string(),
          OPERATIONS_DATABASE_URL: z.string().optional(),
          DOCUMENTS_DATABASE_URL: z.string().optional(),
          NOTIFICATIONS_DATABASE_URL: z.string().optional(),
        })
        .parse(JSON.parse(response.SecretString ?? '{}'));
      Object.assign(source, secret);
    } finally {
      client.destroy();
    }
  }
  const env = envSchema.parse(source);
  const key = `${service.toUpperCase()}_DATABASE_URL`;
  const databaseUrl = z.url().parse(source[key]);
  if (
    env.NODE_ENV === 'production' &&
    new URL(databaseUrl).searchParams.get('sslmode') !== 'verify-full'
  )
    throw new Error('PostgreSQL requiere sslmode=verify-full en producción.');
  if (env.NODE_ENV === 'production' && !source.AWS_SECRET_ID)
    throw new Error('Configura AWS_SECRET_ID en producción.');
  return {
    ...env,
    databaseUrl,
    service,
    port: Number(
      source[`${service.toUpperCase()}_PORT`] ??
        { operations: 3001, documents: 3002, notifications: 3003 }[service],
    ),
  };
}
