import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { api, post, observeSession, setSession, refreshSession } from './api';
import type { Session, NotificationPage } from './types';
const SessionContext = createContext<{
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}>({ session: null, loading: true, login: async () => undefined, logout: async () => undefined });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setLocal] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unobserve = observeSession(setLocal);
    void refreshSession()
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return unobserve;
  }, []);
  useEffect(() => {
    if (!session) return;
    const interval = setInterval(() => {
      void refreshSession().catch(() => undefined);
    }, 12 * 60_000);
    return () => clearInterval(interval);
  }, [session?.user.id]);
  const login = async (email: string, password: string) => {
    setSession(await post<Session>('/auth/login', { email, password }));
  };
  const logout = async () => {
    try {
      await post('/auth/logout');
    } finally {
      setSession(null);
    }
  };
  return (
    <SessionContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}
export const useSession = () => useContext(SessionContext);
type Toast = { message: string; error: boolean };
const DataContext = createContext<{
  revision: number;
  refresh: () => void;
  connected: boolean;
  unread: number;
  notify: (message: string, error?: boolean) => void;
}>({ revision: 0, refresh: () => undefined, connected: false, unread: 0, notify: () => undefined });
export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const [revision, setRevision] = useState(0);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<Toast | null>(null);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  const notify = useCallback((message: string, error = false) => setToast({ message, error }), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!session) return;
    const socket = io('/live', {
      auth: { token: session.accessToken },
      transports: ['websocket', 'polling'],
    });
    socket.on('session.ready', () => {
      setConnected(true);
      refresh();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('notification.created', () => refresh());
    socket.on('connect_error', () => setConnected(false));
    return () => {
      socket.close();
    };
  }, [session?.accessToken, refresh]);
  useEffect(() => {
    if (!session) return;
    let active = true;
    void api<NotificationPage>('/notifications?pageSize=1')
      .then((result) => {
        if (active) setUnread(result.unreadCount);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [revision, session?.user.id]);
  useEffect(() => {
    const reconnect = () => refresh();
    window.addEventListener('focus', reconnect);
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30_000);
    return () => {
      window.removeEventListener('focus', reconnect);
      clearInterval(poll);
    };
  }, [refresh]);
  return (
    <DataContext.Provider value={{ revision, refresh, connected, unread, notify }}>
      {children}
      {toast && (
        <div
          className={`toast ${toast.error ? 'toast-error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.message}
          <button aria-label="Cerrar aviso" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </DataContext.Provider>
  );
}
export const useData = () => useContext(DataContext);
export function useResource<T>(path: string | null) {
  const { revision } = useData();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    void api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((error: unknown) => {
        if (active)
          setError(error instanceof Error ? error.message : 'No se pudo cargar la información.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return { data, loading, error };
}
export function useRoute() {
  const [route, setRoute] = useState(() => location.hash.slice(1) || '/resumen');
  useEffect(() => {
    const handler = () => setRoute(location.hash.slice(1) || '/resumen');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}
export function useDebounced(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setResult(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return result;
}
