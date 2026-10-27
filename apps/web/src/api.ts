import type { Session } from './types';
let current: Session | null = null;
let listener: (session: Session | null) => void = () => undefined;
let refreshing: Promise<Session> | null = null;
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}
export function observeSession(callback: typeof listener) {
  listener = callback;
  return () => {
    listener = () => undefined;
  };
}
export function setSession(session: Session | null) {
  current = session;
  listener(session);
}
export async function refreshSession(): Promise<Session> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) {
      setSession(null);
      throw new ApiError('Inicia sesión para continuar.', 401);
    }
    const session = (await response.json()) as Session;
    setSession(session);
    return session;
  })();
  try {
    return await refreshing;
  } finally {
    refreshing = null;
  }
}
export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (current) headers.set('Authorization', `Bearer ${current.accessToken}`);
  const response = await fetch(`/api/v1${path}`, { ...options, headers, credentials: 'include' });
  if (response.status === 401 && current && retry && !path.startsWith('/auth/')) {
    await refreshSession();
    return api<T>(path, options, false);
  }
  if (!response.ok) {
    const problem = (await response
      .json()
      .catch(() => ({ title: 'No se pudo conectar con el servidor.' }))) as {
      title?: string;
      code?: string;
      requestId?: string;
      details?: { field: string; message: string }[];
    };
    const detail = problem.details?.[0];
    throw new ApiError(
      detail
        ? `${problem.title} ${detail.message}`
        : (problem.title ?? 'No se pudo completar la solicitud.'),
      response.status,
      problem.code,
      problem.requestId,
    );
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
export const post = <T>(path: string, body?: unknown, headers?: HeadersInit) =>
  api<T>(path, {
    method: 'POST',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers,
  });
export const patch = <T>(path: string, body: unknown) =>
  api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
