import { useState } from 'react';
import {
  Download,
  FileText,
  Bell,
  CheckCheck,
  ArrowUpRight,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { post } from '../api';
import { useResource, useData } from '../state';
import {
  SectionHead,
  Pagination,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  Field,
  FormActions,
  type SubmitEvent,
} from '../components/ui';
import {
  date,
  time,
  roleLabels,
  type Role,
  type Document,
  type NotificationPage,
  type Audit,
  type User,
  type Customer,
  type Page,
} from '../types';
import { downloadDocument } from './Orders';
export function DocumentsPage() {
  const [page, setPage] = useState(1);
  const { notify } = useData();
  const { data, loading, error } = useResource<Page<Document>>(`/documents?page=${page}`);
  return (
    <>
      <SectionHead
        eyebrow="ARCHIVO DE OPERACIONES"
        title="Documentos"
        description="Confirmaciones de pedido y órdenes de despacho disponibles para descargar."
      />
      <div className="panel">
        {error ? (
          <ErrorBox message={error} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.data.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th>Pedido</th>
                    <th>Fecha</th>
                    <th>Tamaño</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div className="product-cell">
                          <span className="file-icon">
                            <FileText size={24} />
                          </span>
                          <div>
                            <strong>
                              {doc.kind === 'DISPATCH'
                                ? 'Orden de despacho'
                                : 'Confirmación de pedido'}
                            </strong>
                            <small>{doc.fileName}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <a className="strong-link mono" href={`#/pedidos/${doc.orderId}`}>
                          {doc.orderNumber}
                        </a>
                      </td>
                      <td>
                        {date(doc.createdAt)}
                        <small>{time(doc.createdAt)}</small>
                      </td>
                      <td>{Math.ceil(doc.sizeBytes / 1024)} KB</td>
                      <td>
                        <button
                          className="button secondary small"
                          onClick={() => void downloadDocument(doc.id, notify)}
                        >
                          <Download size={16} />
                          Descargar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data.total}
              pageSize={data.pageSize}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty
            icon={FileText}
            title="Todavía no hay documentos"
            description="Se generan al confirmar y despachar un pedido."
          />
        )}
      </div>
    </>
  );
}
export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const { refresh, notify } = useData();
  const { data, loading, error } = useResource<NotificationPage>(`/notifications?page=${page}`);
  async function read(id: string, orderId: string) {
    try {
      await post(`/notifications/${id}/read`);
      refresh();
      location.hash = `/pedidos/${orderId}`;
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo marcar como leída.', true);
    }
  }
  async function readAll() {
    try {
      await post('/notifications/read-all');
      refresh();
      notify('Todas las notificaciones se marcaron como leídas.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'No se pudo completar.', true);
    }
  }
  return (
    <>
      <SectionHead
        eyebrow="CENTRO DE ACTIVIDAD"
        title="Notificaciones"
        description="Novedades de tus pedidos y documentos en un solo lugar."
        action={
          <button
            className="button secondary"
            disabled={!data?.unreadCount}
            onClick={() => void readAll()}
          >
            <CheckCheck size={18} />
            Marcar todas como leídas
          </button>
        }
      />
      <div className="panel">
        {error ? (
          <ErrorBox message={error} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.data.length ? (
          <>
            <div className="notification-list">
              {data.data.map((n) => (
                <button
                  className={`notification-row ${n.read ? '' : 'unread'}`}
                  key={n.id}
                  onClick={() => void read(n.id, n.orderId)}
                >
                  <span className="notification-icon">
                    {n.type === 'DocumentGenerated' ? <FileText size={22} /> : <Bell size={22} />}
                  </span>
                  <div>
                    <strong>{n.title}</strong>
                    <p>{n.message}</p>
                    <small>
                      {date(n.createdAt)} · {time(n.createdAt)}
                    </small>
                  </div>
                  {!n.read && <i className="unread-dot" />}
                  <ArrowUpRight size={18} />
                </button>
              ))}
            </div>
            <Pagination
              page={page}
              total={data.total}
              pageSize={data.pageSize}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty
            icon={Bell}
            title="Todo al día"
            description="Aquí recibirás los cambios de estado y avisos de documentos."
          />
        )}
      </div>
    </>
  );
}
const actions: Record<string, string> = {
  ORDER_CREATED: 'Pedido registrado',
  ORDER_PREPARING: 'Preparación iniciada',
  ORDER_DISPATCHED: 'Pedido despachado',
  ORDER_DELIVERED: 'Entrega confirmada',
  ORDER_CANCELLED: 'Pedido cancelado',
  PRODUCT_SAVED: 'Producto guardado',
  CUSTOMER_SAVED: 'Cliente guardado',
  STOCK_ADJUSTED: 'Inventario ajustado',
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Acceso de usuario actualizado',
};
export function AuditPage() {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useResource<Page<Audit>>(`/audit?page=${page}`);
  return (
    <>
      <SectionHead
        eyebrow="ADMINISTRACIÓN"
        title="Registro de actividad"
        description="Trazabilidad de las operaciones y de las personas que las realizaron."
      />
      <div className="panel">
        {error ? (
          <ErrorBox message={error} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.data.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Acción</th>
                    <th>Responsable</th>
                    <th>Fecha y hora</th>
                    <th>Identificador de seguimiento</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{actions[a.action] ?? a.action}</strong>
                        <small className="mono">{a.resourceId.slice(0, 8)}</small>
                      </td>
                      <td>{a.actorName}</td>
                      <td>
                        {date(a.createdAt)}
                        <small>{time(a.createdAt)}</small>
                      </td>
                      <td className="mono small-text">{a.correlationId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data.total}
              pageSize={data.pageSize}
              onChange={setPage}
            />
          </>
        ) : (
          <Empty title="Sin actividad registrada" />
        )}
      </div>
    </>
  );
}
export function UsersPage() {
  const [creating, setCreating] = useState(false);
  const { data, loading, error } = useResource<User[]>('/users');
  return (
    <>
      <SectionHead
        eyebrow="ADMINISTRACIÓN"
        title="Equipo y accesos"
        description="Cada persona cuenta con los permisos que necesita para trabajar."
        action={
          <button className="button primary" onClick={() => setCreating(true)}>
            <Plus size={18} />
            Nuevo usuario
          </button>
        }
      />
      <div className="panel">
        {error ? (
          <ErrorBox message={error} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Acceso</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className="role-badge">
                        <ShieldCheck size={14} />
                        {roleLabels[u.role]}
                      </span>
                    </td>
                    <td>
                      <span className={u.active ? 'stock-ok' : 'muted'}>
                        {u.active ? 'Activo' : 'Desactivado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No hay usuarios" />
        )}
      </div>
      {creating && <UserForm onClose={() => setCreating(false)} />}
    </>
  );
}
function UserForm({ onClose }: { onClose: () => void }) {
  const { refresh, notify } = useData();
  const [role, setRole] = useState<Role>('SALES');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const customers = useResource<Page<Customer>>(
    role === 'CUSTOMER' ? '/customers?pageSize=100' : null,
  );
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await post('/users', {
        name: String(f.get('name')),
        email: String(f.get('email')),
        password: String(f.get('password')),
        role,
        customerId: role === 'CUSTOMER' ? String(f.get('customerId')) : null,
      });
      refresh();
      notify('Usuario creado con los permisos seleccionados.');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el usuario.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Nuevo usuario" onClose={busy ? () => undefined : onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <Field label="Nombre">
          <input name="name" required minLength={3} maxLength={120} />
        </Field>
        <Field label="Correo electrónico">
          <input name="email" type="email" required maxLength={180} />
        </Field>
        <Field label="Contraseña" hint="Usa al menos 12 caracteres.">
          <input
            name="password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Rol">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.entries(roleLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {role === 'CUSTOMER' && (
          <Field label="Cliente asociado">
            <select name="customerId" required>
              <option value="">Seleccionar cliente</option>
              {customers.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {error && <ErrorBox message={error} />}
        <FormActions busy={busy} onClose={onClose} label="Crear usuario" />
      </form>
    </Modal>
  );
}
