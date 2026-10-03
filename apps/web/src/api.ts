// Typed client for the Hive dashboard API. All data here is real - served by
// @hive/api from the same Postgres the WhatsApp agent writes to.

export interface Merchant {
  id: string;
  businessName: string | null;
  phone: string;
  onboarded: boolean;
}

export interface TopProduct {
  name: string;
  units: number;
  revenueKobo: number;
}

export interface Analytics {
  windowDays: number;
  revenueKobo: number;
  orderCount: number;
  avgOrderKobo: number;
  pendingOrders: number;
  totalProducts: number;
  totalCustomers: number;
  topProducts: TopProduct[];
}

export interface Overview {
  merchant: { id: string; businessName: string | null };
  analytics: Analytics;
}

export interface Product {
  id: string;
  name: string;
  price: string;
  priceKobo: number;
  /** On-hand units. */
  stock: number;
  /** Units held by unpaid voice orders. */
  reserved: number;
  /** stock - reserved: what can be sold right now. */
  available: number;
  color: string | null;
  size: string | null;
  active: boolean;
  imageUrl: string | null;
}

export type OrderStatus = "RESERVED" | "CONFIRMED" | "FULFILLED" | "CANCELLED" | "EXPIRED";

export type PaymentStatus = "NOT_REQUIRED" | "UNPAID" | "PENDING" | "PAID" | "NEEDS_REVIEW";

export interface Order {
  reference: string;
  status: OrderStatus;
  total: string;
  totalKobo: number;
  customer: string | null;
  items: { name: string; quantity: number }[];
  channel: "whatsapp" | "voice";
  fulfilment: "PICKUP" | "DELIVERY";
  paymentStatus: PaymentStatus;
  /** Paystack checkout link while the order is reserved and awaiting payment. */
  checkoutUrl: string | null;
  reservationExpiresAt: string | null;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  message: string;
  orderReference: string | null;
  createdAt: string;
}

/** What this server actually has configured - drives truthful "not set up" states. */
export interface Integrations {
  voice: {
    toolsConfigured: boolean;
    storeId: string | null;
    storeName: string | null;
    phoneNumber: string | null;
    merchantToolsConfigured: boolean;
    problem: string | null;
  };
  payments: { provider: "paystack" | null; mode: "test" | "live" | null };
  whatsapp: { configured: boolean; provider: string };
  reservationMinutes: number;
}

/**
 * API origin. Empty in dev (Vite proxies /api → the backend). In production set
 * VITE_API_BASE to the deployed API URL (e.g. https://hive-api.onrender.com).
 */
export const API_ORIGIN = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

const BASE = `${API_ORIGIN}/api/dashboard`;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface CreateProductPayload {
  name: string;
  priceNaira: number;
  stock?: number;
  color?: string;
  size?: string;
  description?: string;
  imageUrl?: string;
}

export const api = {
  merchants: () => get<Merchant[]>("/merchants"),
  overview: (id: string) => get<Overview>(`/merchants/${id}/overview`),
  products: (id: string) => get<Product[]>(`/merchants/${id}/products`),
  createProduct: (merchantId: string, payload: CreateProductPayload) =>
    post<Product>(`/merchants/${merchantId}/products`, payload),
  orders: (id: string) => get<Order[]>(`/merchants/${id}/orders`),
  activity: (id: string) => get<ActivityEvent[]>(`/merchants/${id}/activity`),
  integrations: () => get<Integrations>("/integrations"),
};

/** Format kobo (minor units) as ₦ currency. */
export function naira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(kobo / 100);
}
