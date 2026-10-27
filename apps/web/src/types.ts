export type Role = 'ADMIN' | 'SALES' | 'WAREHOUSE' | 'CUSTOMER';
export type Status = 'CONFIRMED' | 'PREPARING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  customerId: string | null;
  active: boolean;
}
export interface Session {
  accessToken: string;
  user: User;
}
export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
  reserved: number;
  available: number;
  minimumStock: number;
  active: boolean;
}
export interface Customer {
  id: string;
  name: string;
  taxId: string;
  email: string;
  phone: string;
  address: string;
}
export interface OrderItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}
export interface Order {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  deliveryAddress: string;
  status: Status;
  totalCents: number;
  currency: 'PEN';
  version: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  history?: { id: string; status: Status; note: string; actorName: string; createdAt: string }[];
}
export interface Document {
  id: string;
  orderId: string;
  orderNumber: string;
  kind: 'CONFIRMATION' | 'DISPATCH';
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}
export interface Notification {
  id: string;
  orderId: string;
  orderNumber: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}
export interface NotificationPage extends Page<Notification> {
  unreadCount: number;
}
export interface Dashboard {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  bookedCents: number;
  status: { status: Status; count: number }[];
  trend: { day: string; count: number; totalCents: number }[];
  lowStock: { id: string; sku: string; name: string; available: number; minimumStock: number }[];
}
export interface Audit {
  id: string;
  action: string;
  actorName: string;
  resourceId: string;
  correlationId: string;
  createdAt: string;
}
export const statusLabels: Record<Status, string> = {
  CONFIRMED: 'Confirmado',
  PREPARING: 'En preparación',
  DISPATCHED: 'Despachado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};
export const roleLabels: Record<Role, string> = {
  ADMIN: 'Administración',
  SALES: 'Ventas',
  WAREHOUSE: 'Almacén',
  CUSTOMER: 'Cliente',
};
export const money = (cents: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100);
export const date = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(value));
export const time = (value: string) =>
  new Intl.DateTimeFormat('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Lima',
  }).format(new Date(value));
