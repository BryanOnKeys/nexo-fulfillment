import {
  ArrowUpRight,
  ArrowRight,
  ShoppingBag,
  Truck,
  CheckCircle2,
  Wallet,
  Plus,
  Box,
  Activity,
} from 'lucide-react';
import { useState } from 'react';
import { useResource, useSession, useData } from '../state';
import { SectionHead, Loading, ErrorBox, Badge, Empty } from '../components/ui';
import {
  money,
  date,
  type Dashboard,
  type Page,
  type Order,
  statusLabels,
  type Status,
} from '../types';
import { NewOrder } from './Orders';
export function DashboardPage() {
  const { session } = useSession();
  const { connected } = useData();
  const { data, loading, error } = useResource<Dashboard>('/dashboard');
  const recent = useResource<Page<Order>>('/orders?pageSize=5');
  const [creating, setCreating] = useState(false);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const name = session!.user.name.split(' · ')[0];
  const today = new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    const key = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    return {
      label: new Intl.DateTimeFormat('es-PE', { weekday: 'short', timeZone: 'America/Lima' })
        .format(d)
        .replace('.', ''),
      count: data.trend.find((t) => t.day === key)?.count ?? 0,
    };
  });
  const max = Math.max(1, ...days.map((d) => d.count));
  const cards = [
    {
      label: 'Pedidos registrados',
      value: String(data.totalOrders),
      detail: 'Todos los estados',
      icon: ShoppingBag,
    },
    {
      label: 'En operación',
      value: String(data.activeOrders),
      detail: 'Confirmados, preparados o en ruta',
      icon: Truck,
    },
    {
      label: 'Pedidos entregados',
      value: String(data.deliveredOrders),
      detail: 'Entregas completadas',
      icon: CheckCircle2,
    },
    {
      label: 'Importe de pedidos',
      value: money(data.bookedCents),
      detail: 'Acumulado sin cancelaciones',
      icon: Wallet,
    },
  ];
  return (
    <>
      <SectionHead
        eyebrow={today.toUpperCase()}
        title={`Todo conectado, ${name}.`}
        description="Una vista clara de tus pedidos y de lo que necesita atención."
        action={
          session!.user.role !== 'WAREHOUSE' && (
            <button className="button primary" onClick={() => setCreating(true)}>
              <Plus size={18} />
              Nuevo pedido
            </button>
          )
        }
      />
      <div className="stats-grid">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={19} />
            </div>
            <strong>{value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-title">
            <div>
              <h2>Actividad de pedidos</h2>
              <p>Pedidos registrados durante los últimos 7 días</p>
            </div>
            <span className="subtle-tag">Última semana</span>
          </div>
          <div
            className="bar-chart"
            role="img"
            aria-label={`Pedidos por día: ${days.map((d) => `${d.label} ${d.count}`).join(', ')}`}
          >
            <div className="chart-lines">
              <span>{max}</span>
              <span>{Math.round(max / 2)}</span>
              <span>0</span>
            </div>
            {days.map((day, i) => (
              <div className="chart-column" key={i}>
                <div className="chart-track">
                  <div
                    className={`chart-bar ${i === 6 ? 'today' : ''}`}
                    style={{
                      height: `${day.count === 0 ? 2 : Math.max(10, (day.count / max) * 100)}%`,
                    }}
                  >
                    <span>{day.count}</span>
                  </div>
                </div>
                <small>{day.label}</small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel status-panel">
          <div className="panel-title">
            <h2>Estado de operación</h2>
            <Activity size={18} />
          </div>
          <div className="status-list">
            {Object.entries(statusLabels).map(([status, label]) => {
              const count = data.status.find((s) => s.status === status)?.count ?? 0;
              return (
                <div key={status}>
                  <span>
                    <i className={`status-dot status-${status.toLowerCase()}`} />
                    {label}
                  </span>
                  <strong>{count}</strong>
                  <div className="status-meter">
                    <i
                      className={`meter-${status.toLowerCase()}`}
                      style={{
                        width: `${data.totalOrders ? (count / data.totalOrders) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="live-note">
            <i className={connected ? 'online' : ''} />
            {connected ? 'Seguimiento en tiempo real activo' : 'Reconectando seguimiento'}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-title">
          <div>
            <h2>Pedidos recientes</h2>
            <p>Las últimas operaciones registradas</p>
          </div>
          <a className="text-link" href="#/pedidos">
            Ver todos
            <ArrowRight size={16} />
          </a>
        </div>
        {recent.error ? (
          <ErrorBox message={recent.error} />
        ) : recent.data?.data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th className="align-right">Importe</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recent.data.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <a className="strong-link mono" href={`#/pedidos/${o.id}`}>
                        {o.number}
                      </a>
                    </td>
                    <td>{o.customerName}</td>
                    <td>{date(o.createdAt)}</td>
                    <td>
                      <Badge status={o.status as Status} />
                    </td>
                    <td className="align-right amount">{money(o.totalCents)}</td>
                    <td>
                      <a
                        className="icon-button"
                        href={`#/pedidos/${o.id}`}
                        aria-label={`Abrir ${o.number}`}
                      >
                        <ArrowUpRight size={18} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Tu operación empieza aquí"
            description="Registra un pedido para verlo en el resumen."
          />
        )}
      </section>
      {session!.user.role !== 'CUSTOMER' && (
        <section className="panel attention-panel">
          <div className="panel-title">
            <div>
              <h2>
                <Box size={18} />
                Existencias que requieren atención
              </h2>
              <p>Productos disponibles por debajo de su mínimo</p>
            </div>
            <a href="#/inventario" className="text-link">
              Revisar inventario
              <ArrowRight size={16} />
            </a>
          </div>
          {data.lowStock.length ? (
            <div className="attention-list">
              {data.lowStock.slice(0, 4).map((p) => (
                <div key={p.id}>
                  <span className="product-initial">
                    <Box size={20} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>
                      {p.sku} · Mínimo {p.minimumStock}
                    </small>
                  </div>
                  <span className="stock-warning">{p.available} disponibles</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="padded muted">
              Las existencias disponibles cubren los mínimos establecidos.
            </p>
          )}
        </section>
      )}
      {creating && <NewOrder onClose={() => setCreating(false)} />}
    </>
  );
}
