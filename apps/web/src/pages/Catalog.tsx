import { useState } from 'react';
import {
  Plus,
  SlidersHorizontal,
  Pencil,
  Box,
  History,
  Users,
  Mail,
  Phone,
  MapPin,
} from 'lucide-react';
import { post, patch } from '../api';
import { useResource, useData, useSession, useDebounced } from '../state';
import {
  SectionHead,
  SearchBox,
  Pagination,
  Empty,
  Loading,
  ErrorBox,
  Modal,
  Field,
  FormActions,
  type SubmitEvent,
} from '../components/ui';
import { money, date, time, type Product, type Customer, type Page } from '../types';
export function InventoryPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Product | null>(null);
  const q = useDebounced(search);
  const { session } = useSession();
  const role = session!.user.role;
  const { data, loading, error } = useResource<Page<Product>>(
    `/products?page=${page}&search=${encodeURIComponent(q)}`,
  );
  const canEdit = ['ADMIN', 'SALES'].includes(role);
  const canAdjust = ['ADMIN', 'WAREHOUSE'].includes(role);
  return (
    <>
      <SectionHead
        eyebrow="CATÁLOGO Y EXISTENCIAS"
        title="Inventario"
        description="Consulta lo disponible, lo reservado y cada movimiento de almacén."
        action={
          canEdit && (
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={18} />
              Nuevo producto
            </button>
          )
        }
      />
      <div className="inventory-legend">
        <span>
          <i className="legend-dot green" />
          Disponible = en almacén − reservado
        </span>
        <span>
          <i className="legend-dot orange" />
          Alerta al alcanzar el mínimo
        </span>
      </div>
      <div className="panel">
        <div className="panel-toolbar">
          <SearchBox
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Buscar producto, código o categoría…"
          />
          <span className="subtle-tag">Precios en PEN</span>
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
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th className="align-right">Precio</th>
                    <th className="align-right">Almacén</th>
                    <th className="align-right">Reservado</th>
                    <th className="align-right">Disponible</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.data.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="product-cell">
                          <span className="product-initial">
                            <Box size={21} />
                          </span>
                          <div>
                            <strong>{p.name}</strong>
                            <small className="mono">
                              {p.sku}
                              {!p.active ? ' · Inactivo' : ''}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="subtle-tag">{p.category}</span>
                      </td>
                      <td className="align-right amount">{money(p.priceCents)}</td>
                      <td className="align-right">{p.stock}</td>
                      <td className="align-right muted">{p.reserved}</td>
                      <td className="align-right">
                        <span
                          className={p.available <= p.minimumStock ? 'stock-warning' : 'stock-ok'}
                        >
                          {p.available}
                        </span>
                      </td>
                      <td>
                        <div className="action-group">
                          {canEdit && (
                            <button
                              className="icon-button"
                              title="Editar producto"
                              aria-label={`Editar ${p.name}`}
                              onClick={() => setEditing(p)}
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                          {canAdjust && (
                            <button
                              className="icon-button"
                              title="Ajustar existencias"
                              aria-label={`Ajustar ${p.name}`}
                              onClick={() => setAdjusting(p)}
                            >
                              <SlidersHorizontal size={16} />
                            </button>
                          )}
                          {role !== 'CUSTOMER' && (
                            <button
                              className="icon-button"
                              title="Ver movimientos"
                              aria-label={`Movimientos de ${p.name}`}
                              onClick={() => setMovements(p)}
                            >
                              <History size={16} />
                            </button>
                          )}
                        </div>
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
            title="No encontramos productos"
            description="Prueba otra búsqueda o agrega un producto al catálogo."
          />
        )}
      </div>
      {editing && (
        <ProductForm
          product={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}{' '}
      {adjusting && <AdjustmentForm product={adjusting} onClose={() => setAdjusting(null)} />}{' '}
      {movements && <Movements product={movements} onClose={() => setMovements(null)} />}
    </>
  );
}
function ProductForm({ product, onClose }: { product?: Product; onClose: () => void }) {
  const { notify, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    const input = {
      sku: String(f.get('sku')).toUpperCase(),
      name: String(f.get('name')),
      description: String(f.get('description')),
      category: String(f.get('category')),
      priceCents: Math.round(Number(f.get('price')) * 100),
      minimumStock: Number(f.get('minimumStock')),
      active: f.get('active') === 'on',
    };
    try {
      if (product) await patch(`/products/${product.id}`, input);
      else await post('/products', input);
      refresh();
      notify(
        product ? 'Producto actualizado.' : 'Producto creado. Ya puedes registrar sus existencias.',
      );
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar el producto.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product ? 'Editar producto' : 'Nuevo producto'}
      subtitle="Los cambios de precio se aplican a los pedidos nuevos."
      onClose={busy ? () => undefined : onClose}
    >
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <Field label="Código SKU">
            <input
              name="sku"
              required
              pattern="[A-Za-z0-9-]{3,40}"
              maxLength={40}
              defaultValue={product?.sku}
              placeholder="PANEL-016"
            />
          </Field>
          <Field label="Categoría">
            <input
              name="category"
              required
              minLength={2}
              maxLength={80}
              defaultValue={product?.category ?? 'General'}
            />
          </Field>
        </div>
        <Field label="Nombre del producto">
          <input name="name" required minLength={3} maxLength={150} defaultValue={product?.name} />
        </Field>
        <Field label="Descripción">
          <textarea
            name="description"
            rows={2}
            maxLength={1500}
            defaultValue={product?.description}
          />
        </Field>
        <div className="form-grid">
          <Field label="Precio unitario (S/)">
            <input
              name="price"
              type="number"
              step="0.01"
              min="0.01"
              max="1000000"
              required
              defaultValue={product ? product.priceCents / 100 : ''}
            />
          </Field>
          <Field label="Existencia mínima">
            <input
              name="minimumStock"
              type="number"
              min={0}
              max={1000000}
              required
              defaultValue={product?.minimumStock ?? 5}
            />
          </Field>
        </div>
        <label className="check-field">
          <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
          Producto activo para pedidos
        </label>
        {error && <ErrorBox message={error} />}
        <FormActions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
function AdjustmentForm({ product, onClose }: { product: Product; onClose: () => void }) {
  const { notify, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [delta, setDelta] = useState(1);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await post(`/products/${product.id}/adjustments`, { delta, reason: String(f.get('reason')) });
      refresh();
      notify('Ajuste de inventario registrado.');
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo registrar el ajuste.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Ajustar existencias"
      subtitle={product.name}
      onClose={busy ? () => undefined : onClose}
    >
      <form onSubmit={(e) => void submit(e)}>
        <div className="stock-summary">
          <div>
            <small>En almacén</small>
            <strong>{product.stock}</strong>
          </div>
          <div>
            <small>Reservado</small>
            <strong>{product.reserved}</strong>
          </div>
          <div>
            <small>Después del ajuste</small>
            <strong>{product.stock + delta}</strong>
          </div>
        </div>
        <Field
          label="Cantidad a sumar o restar"
          hint="Usa una cantidad negativa para registrar una salida o corrección."
        >
          <input
            type="number"
            required
            min={-1000000}
            max={1000000}
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
          />
        </Field>
        <Field label="Motivo del movimiento">
          <textarea
            name="reason"
            required
            minLength={5}
            maxLength={300}
            rows={3}
            placeholder="Ejemplo: recepción de mercadería del proveedor"
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <FormActions busy={busy} onClose={onClose} label="Registrar ajuste" />
      </form>
    </Modal>
  );
}
function Movements({ product, onClose }: { product: Product; onClose: () => void }) {
  const { data, loading, error } = useResource<
    { id: string; kind: string; quantity: number; reason: string; createdAt: string }[]
  >(`/products/${product.id}/movements`);
  const labels: Record<string, string> = {
    RESERVE: 'Reserva',
    RELEASE: 'Liberación',
    DISPATCH: 'Despacho',
    ADJUST: 'Ajuste',
  };
  return (
    <Modal
      title="Movimientos de inventario"
      subtitle={`${product.sku} · ${product.name}`}
      wide
      onClose={onClose}
    >
      {error ? (
        <ErrorBox message={error} />
      ) : loading ? (
        <Loading />
      ) : data?.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Movimiento</th>
                <th>Cantidad</th>
                <th>Motivo</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <td>{labels[m.kind] ?? m.kind}</td>
                  <td className="amount">
                    {m.quantity > 0 ? '+' : ''}
                    {m.quantity}
                  </td>
                  <td>{labels[m.reason] ?? m.reason}</td>
                  <td>
                    {date(m.createdAt)}
                    <small>{time(m.createdAt)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Sin movimientos"
          description="Las reservas, despachos y ajustes quedarán registrados aquí."
        />
      )}
    </Modal>
  );
}
export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const q = useDebounced(search);
  const { session } = useSession();
  const canEdit = ['ADMIN', 'SALES'].includes(session!.user.role);
  const { data, loading, error } = useResource<Page<Customer>>(
    `/customers?page=${page}&search=${encodeURIComponent(q)}`,
  );
  return (
    <>
      <SectionHead
        eyebrow="RELACIONES COMERCIALES"
        title={session!.user.role === 'CUSTOMER' ? 'Mi cuenta' : 'Clientes'}
        description="Información de contacto y direcciones para coordinar las entregas."
        action={
          canEdit && (
            <button className="button primary" onClick={() => setEditing('new')}>
              <Plus size={18} />
              Nuevo cliente
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
            placeholder="Buscar cliente o documento…"
          />
          <Users size={19} className="muted" />
        </div>
        {error ? (
          <ErrorBox message={error} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.data.length ? (
          <>
            <div className="customer-grid">
              {data.data.map((c) => (
                <article className="customer-card" key={c.id}>
                  <div className="customer-title">
                    <span className="customer-avatar">
                      {c.name
                        .split(' ')
                        .slice(0, 2)
                        .map((n) => n[0])
                        .join('')}
                    </span>
                    {canEdit && (
                      <button
                        className="icon-button"
                        aria-label={`Editar ${c.name}`}
                        onClick={() => setEditing(c)}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </div>
                  <h3>{c.name}</h3>
                  <span className="mono muted">Documento {c.taxId}</span>
                  <p>
                    <Mail size={15} />
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  </p>
                  <p>
                    <Phone size={15} />
                    {c.phone || 'Sin teléfono registrado'}
                  </p>
                  <p>
                    <MapPin size={15} />
                    {c.address}
                  </p>
                </article>
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
            title="No encontramos clientes"
            description="Prueba otra búsqueda o registra un cliente."
          />
        )}
      </div>
      {editing && (
        <CustomerForm
          customer={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
function CustomerForm({ customer, onClose }: { customer?: Customer; onClose: () => void }) {
  const { notify, refresh } = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const input = Object.fromEntries(
      ['name', 'taxId', 'email', 'phone', 'address'].map((key) => [key, String(f.get(key))]),
    );
    setBusy(true);
    setError('');
    try {
      if (customer) await patch(`/customers/${customer.id}`, input);
      else await post('/customers', input);
      refresh();
      notify('Información del cliente guardada.');
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={customer ? 'Editar cliente' : 'Nuevo cliente'}
      onClose={busy ? () => undefined : onClose}
    >
      <form onSubmit={(e) => void submit(e)}>
        <Field label="Nombre o razón social">
          <input name="name" required minLength={3} maxLength={150} defaultValue={customer?.name} />
        </Field>
        <div className="form-grid">
          <Field label="Documento / RUC">
            <input
              name="taxId"
              required
              pattern="[A-Za-z0-9-]{8,20}"
              maxLength={20}
              defaultValue={customer?.taxId}
            />
          </Field>
          <Field label="Teléfono">
            <input name="phone" type="tel" maxLength={30} defaultValue={customer?.phone} />
          </Field>
        </div>
        <Field label="Correo electrónico">
          <input
            name="email"
            type="email"
            required
            maxLength={180}
            defaultValue={customer?.email}
          />
        </Field>
        <Field label="Dirección de entrega">
          <textarea
            name="address"
            required
            minLength={5}
            maxLength={300}
            rows={2}
            defaultValue={customer?.address}
          />
        </Field>
        {error && <ErrorBox message={error} />}
        <FormActions busy={busy} onClose={onClose} />
      </form>
    </Modal>
  );
}
