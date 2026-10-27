import { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingBag,
  Boxes,
  Users,
  FileText,
  Bell,
  Activity,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Menu,
  X,
  ArrowRight,
  Eye,
  EyeOff,
  Workflow,
  Radio,
} from 'lucide-react';
import { useSession, DataProvider, useData, useRoute } from './state';
import { roleLabels } from './types';
import { Loading, ErrorBox } from './components/ui';
import { DashboardPage } from './pages/Dashboard';
import { OrdersPage, OrderDetail } from './pages/Orders';
import { InventoryPage, CustomersPage } from './pages/Catalog';
import { DocumentsPage, NotificationsPage, AuditPage, UsersPage } from './pages/Activity';
export function App() {
  const { session, loading } = useSession();
  if (loading)
    return (
      <div className="boot">
        <div className="brand-symbol">N</div>
        <Loading />
      </div>
    );
  return session ? (
    <DataProvider>
      <Workspace />
    </DataProvider>
  ) : (
    <Login />
  );
}
function Login() {
  const { login } = useSession();
  const [email, setEmail] = useState('admin@nexo.local');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="login">
      <aside className="login-story">
        <a className="brand" href="#">
          <span className="brand-symbol">N</span>
          <strong>
            NEXO<span>OPERACIONES CONECTADAS</span>
          </strong>
        </a>
        <div className="story-main">
          <span className="story-tag">
            <Radio size={14} />
            Una operación. Todo conectado.
          </span>
          <h1>
            De cada pedido,
            <br />
            al siguiente
            <br />
            <em>gran paso.</em>
          </h1>
          <p>
            Conecta tus ventas, tu almacén y tus entregas con una visión clara de lo que sucede.
          </p>
          <div className="story-visual">
            <div className="visual-line" />
            <span>
              <ShoppingBag />
              <strong>Pedido</strong>
              <small>Confirmado</small>
            </span>
            <span>
              <Boxes />
              <strong>Almacén</strong>
              <small>Preparado</small>
            </span>
            <span>
              <Workflow />
              <strong>Entrega</strong>
              <small>Conectada</small>
            </span>
          </div>
        </div>
        <div className="story-footer">
          PEDIDOS · INVENTARIO · DESPACHOS<span>NEXO / 01</span>
        </div>
      </aside>
      <main className="login-form-area">
        <div className="login-form">
          <span className="eyebrow">TU CENTRO DE OPERACIONES</span>
          <h2>Bienvenido a NEXO</h2>
          <p>Ingresa a tu cuenta para continuar.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              setError('');
              void login(email, password)
                .catch((error: unknown) =>
                  setError(error instanceof Error ? error.message : 'No se pudo iniciar sesión.'),
                )
                .finally(() => setBusy(false));
            }}
          >
            <label className="field">
              <span>Correo electrónico</span>
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@empresa.com"
              />
            </label>
            <label className="field">
              <span>Contraseña</span>
              <div className="password-field">
                <input
                  type={visible ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contraseña"
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setVisible((v) => !v)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {error && <ErrorBox message={error} />}
            <button className="button primary login-submit" disabled={busy}>
              {busy ? 'Ingresando…' : 'Ingresar a mi cuenta'}
              <ArrowRight size={19} />
            </button>
          </form>
          <div className="login-help">
            <ShieldCheck size={20} />
            <p>
              Acceso exclusivo para usuarios autorizados.
              <br />
              Solicita tu cuenta al administrador de tu equipo.
            </p>
          </div>
        </div>
        <footer>NEXO · Una visión clara de tu operación.</footer>
      </main>
    </div>
  );
}
function Workspace() {
  const { session, logout } = useSession();
  const { connected, unread, notify } = useData();
  const route = useRoute();
  const [menu, setMenu] = useState(false);
  const user = session!.user;
  const current = route.split('/')[1];
  const navigation = [
    { path: 'resumen', label: 'Resumen', icon: LayoutDashboard },
    { path: 'pedidos', label: 'Pedidos', icon: ShoppingBag },
    { path: 'inventario', label: 'Inventario', icon: Boxes },
    { path: 'clientes', label: user.role === 'CUSTOMER' ? 'Mi cuenta' : 'Clientes', icon: Users },
    { path: 'documentos', label: 'Documentos', icon: FileText },
    { path: 'notificaciones', label: 'Notificaciones', icon: Bell },
  ];
  const title =
    navigation.find((n) => n.path === current)?.label ??
    (current === 'actividad'
      ? 'Registro de actividad'
      : current === 'equipo'
        ? 'Equipo y accesos'
        : 'Operaciones');
  let page;
  if (current === 'pedidos')
    page = route.split('/')[2] ? (
      <OrderDetail key={route.split('/')[2]!} id={route.split('/')[2]!} />
    ) : (
      <OrdersPage />
    );
  else if (current === 'inventario') page = <InventoryPage />;
  else if (current === 'clientes') page = <CustomersPage />;
  else if (current === 'documentos') page = <DocumentsPage />;
  else if (current === 'notificaciones') page = <NotificationsPage />;
  else if (current === 'actividad' && user.role === 'ADMIN') page = <AuditPage />;
  else if (current === 'equipo' && user.role === 'ADMIN') page = <UsersPage />;
  else page = <DashboardPage />;
  return (
    <div className="workspace">
      <a
        href="#main-content"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Ir al contenido
      </a>
      {menu && <div className="sidebar-overlay" onClick={() => setMenu(false)} />}
      <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <a className="brand" href="#/resumen">
            <span className="brand-symbol">N</span>
            <strong>
              NEXO<span>OPERACIONES CONECTADAS</span>
            </strong>
          </a>
          <button
            className="icon-button mobile-only"
            aria-label="Cerrar navegación"
            onClick={() => setMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">N</span>
          <div>
            <strong>Centro de operaciones</strong>
            <small>Distribución y abastecimiento</small>
          </div>
        </div>
        <span className="nav-label">ESPACIO DE TRABAJO</span>
        <nav aria-label="Navegación principal">
          {navigation.map(({ path, label, icon: Icon }) => (
            <a
              key={path}
              className={current === path ? 'active' : ''}
              href={`#/${path}`}
              onClick={() => setMenu(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {path === 'notificaciones' && unread > 0 && <b>{unread > 99 ? '99+' : unread}</b>}
            </a>
          ))}
        </nav>
        {user.role === 'ADMIN' && (
          <>
            <span className="nav-label">ADMINISTRACIÓN</span>
            <nav aria-label="Administración">
              <a
                className={current === 'equipo' ? 'active' : ''}
                href="#/equipo"
                onClick={() => setMenu(false)}
              >
                <ShieldCheck size={19} />
                Equipo y accesos
              </a>
              <a
                className={current === 'actividad' ? 'active' : ''}
                href="#/actividad"
                onClick={() => setMenu(false)}
              >
                <Activity size={19} />
                Registro de actividad
              </a>
            </nav>
          </>
        )}
        <div className="sidebar-bottom">
          <div className="sidebar-status">
            <i className={connected ? 'online' : ''} />
            <span>{connected ? 'Operación conectada' : 'Reconectando seguimiento'}</span>
          </div>
          <div className="sidebar-user">
            <span className="avatar">
              {user.name
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <div>
              <strong>{user.name.split(' · ')[0]}</strong>
              <small>{roleLabels[user.role]}</small>
            </div>
            <button
              className="icon-button"
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              onClick={() => void logout().catch(() => notify('La sesión local se cerró.', false))}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-only"
              aria-label="Abrir navegación"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <span>Espacio de trabajo</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div>
            <span className="today">
              {new Intl.DateTimeFormat('es-PE', {
                day: '2-digit',
                month: 'short',
                timeZone: 'America/Lima',
              }).format(new Date())}
            </span>
            <a
              className="bell-button"
              href="#/notificaciones"
              aria-label={`${unread} notificaciones sin leer`}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </a>
            <span className="avatar small-avatar">{user.name[0]}</span>
          </div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          {page}
        </main>
        <footer className="workspace-footer">
          <span>NEXO · Operaciones conectadas</span>
          <span>Hecho para mantener todo en movimiento.</span>
        </footer>
      </div>
    </div>
  );
}
