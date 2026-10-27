import { useState } from 'react';
import {
  Plus,
  ArrowUpRight,
  ArrowLeft,
  PackageCheck,
  Truck,
  CheckCircle2,
  XCircle,
  FileText,
  Download,
  Trash2,
  MapPin,
  Clock3,
} from 'lucide-react';
import { api, post, patch } from '../api';
import { useResource, useData, useSession, useDebounced } from '../state';
import {
  SectionHead,
  SearchBox,
  Pagination,
  Badge,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  Field,
  FormActions,
  type SubmitEvent,
} from '../components/ui';
import {
  money,
  date,
  time,
  statusLabels,
  type Status,
  type Order,
  type Product,
  type Customer,
  type Page,
  type Document,
} from '../types';

export function OrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(search);
  const { session } = useSession();
  const { data, loading, error } = useResource<Page<Order>>(
    `/orders?page=${page}&search=${encodeURIComponent(q)}${status ? `&status=${status}` : ''}`,
  );
  return (
    <>
      <SectionHead
        eyebrow="CONTROL COMERCIAL"
        title="Pedidos"
        description="Cada pedido, desde la reserva hasta la entrega."
        action={
          session?.user.role !== 'WAREHOUSE' && (
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={18} />
              Nuevo pedido
            </button>
          )
        }
      />
      <div className="panel">
        <div className="panel-toolbar">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar pedido o cliente…"
          />
          <select
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(statusLabels).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </div>
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
                    <th>Pedido / fecha</th>
                    <th>Cliente</th>
                    <th>Productos</th>
                    <th>Estado</th>
                    <th className="align-right">Importe</th>
                    <th aria-label="Abrir" />
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <a className="strong-link mono" href={`#/pedidos/${order.id}`}>
                          {order.number}
                        </a>
                        <small>{date(order.createdAt)}</small>
                      </td>
                      <td>
                        <strong>{order.customerName}</strong>
                        <small className="truncate">{order.deliveryAddress}</small>
                      </td>
                      <td>
                        {order.items.reduce((sum, i) => sum + i.quantity, 0)} unidades
                        <small>{order.items.length} referencias</small>
                      </td>
                      <td>
                        <Badge status={order.status} />
                      </td>
                      <td className="align-right amount">{money(order.totalCents)}</td>
                      <td>
                        <a
                          href={`#/pedidos/${order.id}`}
                          className="icon-button"
                          aria-label={`Abrir ${order.number}`}
                        >
                          <ArrowUpRight size={18} />
                        </a>
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
            title="No encontramos pedidos"
            description="Prueba otro filtro o registra el primer pedido."
          />
        )}
      </div>
      {creating && <NewOrder onClose={() => setCreating(false)} />}
    </>
  );
}
export function NewOrder({ onClose }: { onClose: () => void }) {
  const { session } = useSession();
  const { refresh, notify } = useData();
  const customers = useResource<Page<Customer>>('/customers?pageSize=100');
  const products = useResource<Page<Product>>('/products?pageSize=100');
  const [customerId, setCustomer] = useState(session?.user.customerId ?? '');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState([{ productId: '', quantity: 1 }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const customer = customers.data?.data.find((c) => c.id === customerId);
  const delivery = address || customer?.address || '';
  const total = lines.reduce(
    (sum, line) =>
      sum +
      (products.data?.data.find((p) => p.id === line.productId)?.priceCents ?? 0) * line.quantity,
    0,
  );
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const order = await post<Order>(
        '/orders',
        { customerId, deliveryAddress: delivery, notes, items: lines },
        { 'Idempotency-Key': key },
      );
      refresh();
      notify('Pedido registrado. Las existencias quedaron reservadas.');
      location.hash = `/pedidos/${order.id}`;
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo registrar el pedido.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Nuevo pedido"
      subtitle="Selecciona los productos y confirma la dirección de entrega."
      wide
      onClose={busy ? () => undefined : onClose}
    >
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <Field label="Cliente">
            <select
              required
              value={customerId}
              onChange={(e) => {
                setCustomer(e.target.value);
                setAddress('');
              }}
            >
              <option value="">Seleccionar cliente</option>
              {customers.data?.data.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Dirección de entrega">
            <input
              required
              minLength={5}
              maxLength={300}
              value={delivery}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Dirección completa"
            />
          </Field>
        </div>
        <div className="line-items">
          <div className="subheading">
            <h3>Productos del pedido</h3>
            <span>{lines.length} referencias</span>
          </div>
          {lines.map((line, index) => {
            const product = products.data?.data.find((p) => p.id === line.productId);
            return (
              <div className="order-line" key={index}>
                <Field
                  label={`Producto ${index + 1}`}
                  hint={
                    product
                      ? `${product.available} disponibles · ${money(product.priceCents)} por unidad`
                      : undefined
                  }
                >
                  <select
                    required
                    value={line.productId}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index ? { ...l, productId: e.target.value } : l,
                        ),
                      )
                    }
                  >
                    <option value="">Seleccionar producto</option>
                    {products.data?.data
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} · {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Cantidad">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    required
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(
                        lines.map((l, i) =>
                          i === index ? { ...l, quantity: Number(e.target.value) } : l,
                        ),
                      )
                    }
                  />
                </Field>
                <div className="line-total">
                  {money((product?.priceCents ?? 0) * line.quantity)}
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Quitar producto"
                  disabled={lines.length === 1}
                  onClick={() => setLines(lines.filter((_, i) => i !== index))}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            );
          })}
          <button
            className="button text"
            type="button"
            disabled={lines.length >= 50}
            onClick={() => setLines([...lines, { productId: '', quantity: 1 }])}
          >
            <Plus size={16} />
            Agregar producto
          </button>
        </div>
        <Field label="Notas de entrega (opcional)">
          <textarea
            maxLength={1000}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Indicaciones para el equipo de almacén"
          />
        </Field>
        <div className="order-total">
          <span>Total del pedido</span>
          <strong>{money(total)}</strong>
        </div>
        {(error || customers.error || products.error) && (
          <ErrorBox message={error || customers.error || products.error} />
        )}
        <FormActions
          busy={busy || customers.loading || products.loading}
          onClose={onClose}
          label="Confirmar y reservar"
        />
      </form>
    </Modal>
  );
}
export function OrderDetail({ id }: { id: string }) {
  const { data: order, loading, error } = useResource<Order>(`/orders/${id}`);
  const documents = useResource<Page<Document>>(`/documents?orderId=${id}`);
  const { session } = useSession();
  const { refresh, notify } = useData();
  const [nextStatus, setNext] = useState<Status | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  if (loading && !order) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!order) return null;
  const role = session!.user.role;
  const next: Partial<Record<Status, Status>> = {
    CONFIRMED: 'PREPARING',
    PREPARING: 'DISPATCHED',
    DISPATCHED: 'DELIVERED',
  };
  const availableNext = next[order.status];
  const canAdvance = ['ADMIN', 'WAREHOUSE'].includes(role) && availableNext;
  const canCancel =
    ['ADMIN', 'SALES'].includes(role) && ['CONFIRMED', 'PREPARING'].includes(order.status);
  async function transition(e: SubmitEvent) {
    e.preventDefault();
    if (!order || !nextStatus) return;
    setBusy(true);
    setActionError('');
    try {
      await patch(`/orders/${id}/status`, {
        status: nextStatus,
        expectedVersion: order.version,
        note,
      });
      setNext(null);
      setNote('');
      refresh();
      notify('Estado del pedido actualizado.');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No se pudo actualizar.');
      refresh();
    } finally {
      setBusy(false);
    }
  }
  const steps: Status[] = ['CONFIRMED', 'PREPARING', 'DISPATCHED', 'DELIVERED'];
  const position = steps.indexOf(order.status);
  return (
    <>
      <a href="#/pedidos" className="back-link">
        <ArrowLeft size={16} />
        Todos los pedidos
      </a>
      <SectionHead
        eyebrow="DETALLE DEL PEDIDO"
        title={order.number}
        description={`Registrado el ${date(order.createdAt)} a las ${time(order.createdAt)}`}
        action={
          <div className="action-group">
            {canCancel && (
              <button
                className="button danger-outline"
                onClick={() => {
                  setNext('CANCELLED');
                  setActionError('');
                }}
              >
                Cancelar pedido
              </button>
            )}
            {canAdvance && (
              <button
                className="button primary"
                onClick={() => {
                  setNext(availableNext);
                  setActionError('');
                }}
              >
                <PackageCheck size={18} />
                {statusLabels[availableNext]}
              </button>
            )}
          </div>
        }
      />
      <div className="order-progress panel">
        {order.status === 'CANCELLED' ? (
          <div className="cancelled-notice">
            <XCircle />
            Este pedido fue cancelado y sus reservas fueron liberadas.
          </div>
        ) : (
          steps.map((step, i) => (
            <div key={step} className={`progress-step ${i <= position ? 'complete' : ''}`}>
              <span>
                {i < position ? <CheckCircle2 size={19} /> : i === 2 ? <Truck size={19} /> : i + 1}
              </span>
              <strong>{statusLabels[step]}</strong>
            </div>
          ))
        )}
      </div>
      <div className="detail-grid">
        <div>
          <section className="panel">
            <div className="panel-title">
              <h2>Detalle de productos</h2>
              <Badge status={order.status} />
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th className="align-right">Precio unitario</th>
                    <th className="align-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.productId}>
                      <td>
                        <strong>{item.name}</strong>
                        <small className="mono">{item.sku}</small>
                      </td>
                      <td>{item.quantity}</td>
                      <td className="align-right">{money(item.unitPriceCents)}</td>
                      <td className="align-right amount">
                        {money(item.unitPriceCents * item.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="order-total padded">
              <span>Total en soles</span>
              <strong>{money(order.totalCents)}</strong>
            </div>
          </section>
          <section className="panel">
            <div className="panel-title">
              <h2>Historial del pedido</h2>
              <Clock3 size={18} />
            </div>
            <ol className="timeline">
              {order.history?.map((h) => (
                <li key={h.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{statusLabels[h.status]}</strong>
                    {h.note && <p>{h.note}</p>}
                    <small>
                      {h.actorName} · {date(h.createdAt)} · {time(h.createdAt)}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside>
          <section className="panel detail-card">
            <span className="eyebrow">ENTREGAR A</span>
            <h3>{order.customerName}</h3>
            <p className="address">
              <MapPin size={18} />
              {order.deliveryAddress}
            </p>
            {order.notes && (
              <div className="note">
                <strong>Indicaciones</strong>
                <p>{order.notes}</p>
              </div>
            )}
          </section>
          <section className="panel detail-card">
            <div className="subheading">
              <h3>Documentos</h3>
              <FileText size={19} />
            </div>
            {documents.error ? (
              <ErrorBox message={documents.error} />
            ) : documents.data?.data.length ? (
              documents.data.data.map((doc) => (
                <button
                  key={doc.id}
                  className="document-link"
                  onClick={() => void downloadDocument(doc.id, notify)}
                >
                  <FileText size={22} />
                  <span>
                    <strong>
                      {doc.kind === 'DISPATCH' ? 'Orden de despacho' : 'Confirmación de pedido'}
                    </strong>
                    <small>PDF · {Math.ceil(doc.sizeBytes / 1024)} KB</small>
                  </span>
                  <Download size={17} />
                </button>
              ))
            ) : (
              <p className="muted">
                El documento se está procesando. Aparecerá aquí cuando esté disponible.
              </p>
            )}
          </section>
        </aside>
      </div>
      {nextStatus && (
        <Modal
          title={
            nextStatus === 'CANCELLED'
              ? 'Cancelar pedido'
              : `Cambiar a: ${statusLabels[nextStatus]}`
          }
          onClose={busy ? () => undefined : () => setNext(null)}
        >
          <form onSubmit={(e) => void transition(e)}>
            <p className="muted">
              {nextStatus === 'CANCELLED'
                ? 'Se liberarán las existencias reservadas para este pedido.'
                : nextStatus === 'DISPATCHED'
                  ? 'Se descontarán del almacén las unidades reservadas.'
                  : 'El cambio quedará registrado en el historial del pedido.'}
            </p>
            <Field label="Observación (opcional)">
              <textarea
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            {actionError && <ErrorBox message={actionError} />}
            <FormActions busy={busy} onClose={() => setNext(null)} label="Confirmar cambio" />
          </form>
        </Modal>
      )}
    </>
  );
}
export async function downloadDocument(
  id: string,
  notify: (message: string, error?: boolean) => void,
) {
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  try {
    const result = await api<{ url: string }>(`/documents/${id}/download`);
    if (tab) tab.location.href = result.url;
    else location.assign(result.url);
  } catch (error) {
    tab?.close();
    notify(error instanceof Error ? error.message : 'No se pudo descargar el documento.', true);
  }
}
