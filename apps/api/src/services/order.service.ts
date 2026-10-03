import type { OrderStatus } from "@prisma/client";
import { prisma } from "../config/db.js";
import { orderReference } from "../utils/ref.js";
import { findProductByName } from "./product.service.js";
import { notifyOrderPlaced, notifyOrderFulfilled } from "./notify.service.js";

export interface OrderLineInput {
  /** Product name (will be fuzzy-matched) OR a concrete productId. */
  product: string;
  quantity: number;
}

export interface CreateOrderInput {
  merchantId: string;
  customerId?: string;
  lines: OrderLineInput[];
}

/**
 * Create a CONFIRMED order from human-described lines. Resolves each line to a real
 * product, snapshots name + price, computes the total, decrements stock atomically,
 * and notifies both merchant and customer.
 */
export async function createOrder(input: CreateOrderInput) {
  const resolved: {
    productId: string;
    nameSnapshot: string;
    priceKobo: number;
    quantity: number;
  }[] = [];

  for (const line of input.lines) {
    const product =
      (await prisma.product.findFirst({
        where: { id: line.product, merchantId: input.merchantId },
      })) ?? (await findProductByName(input.merchantId, line.product));

    if (!product) throw new Error(`Product not found: "${line.product}"`);
    const quantity = Math.max(1, Math.floor(line.quantity || 1));
    resolved.push({
      productId: product.id,
      nameSnapshot: product.name,
      priceKobo: product.priceKobo,
      quantity,
    });
  }

  const totalKobo = resolved.reduce((sum, r) => sum + r.priceKobo * r.quantity, 0);

  const order = await prisma.$transaction(async (tx) => {
    // Decrement stock for each item
    for (const item of resolved) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    if (input.customerId) {
      await tx.customer.update({
        where: { id: input.customerId },
        data: { lastOrderedAt: new Date() },
      });
    }

    return tx.order.create({
      data: {
        reference: orderReference(),
        merchantId: input.merchantId,
        customerId: input.customerId,
        status: "CONFIRMED",
        totalKobo,
        items: { create: resolved },
      },
      include: { items: true, customer: true, merchant: true },
    });
  }, { timeout: 20000, maxWait: 10000 });

  void notifyOrderPlaced(order.id).catch(() => {});

  return order;
}

export async function getOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true, merchant: true },
  });
}

export async function getOrderByReference(reference: string) {
  return prisma.order.findUnique({
    where: { reference },
    include: { items: true, customer: true, merchant: true },
  });
}

/** List a merchant's orders, optionally filtered by status. */
export async function listOrders(
  merchantId: string,
  opts: { status?: OrderStatus | OrderStatus[]; limit?: number } = {},
) {
  const status = opts.status
    ? Array.isArray(opts.status)
      ? { in: opts.status }
      : opts.status
    : undefined;
  return prisma.order.findMany({
    where: { merchantId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 20,
    include: { items: true, customer: true },
  });
}

/** Mark an order as fulfilled/delivered. Scoped to the merchant. */
export async function fulfillOrder(reference: string, merchantId: string) {
  const order = await getOrderByReference(reference);
  if (!order || order.merchantId !== merchantId) return { ok: false as const, error: "Order not found." };
  if (order.status === "FULFILLED") return { ok: true as const, order };
  if (order.status !== "CONFIRMED")
    return { ok: false as const, error: `Order ${order.reference} cannot be fulfilled (status: ${order.status}).` };

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: "FULFILLED" },
    include: { items: true },
  });

  void notifyOrderFulfilled(order.id).catch(() => {});

  return { ok: true as const, order: updated };
}

/** The customer's most recent order that can still be cancelled. */
export async function latestCancellableOrder(customerId: string) {
  return prisma.order.findFirst({
    where: { customerId, status: "CONFIRMED" },
    orderBy: { createdAt: "desc" },
    include: { items: true, customer: true, merchant: true },
  });
}

/**
 * Cancel an order. Resolve it by explicit reference, else fall back to the
 * customer's most recent cancellable order. Scoped to the customer/merchant.
 * Restores the reserved stock atomically.
 */
export async function cancelOrder(opts: { reference?: string; customerId?: string; merchantId?: string }) {
  let order = opts.reference ? await getOrderByReference(opts.reference) : null;
  if (!order && opts.customerId) order = await latestCancellableOrder(opts.customerId);

  if (!order) return { ok: false as const, error: "No matching order to cancel." };
  if (opts.customerId && order.customerId && order.customerId !== opts.customerId) {
    return { ok: false as const, error: "That order belongs to a different customer." };
  }
  if (opts.merchantId && order.merchantId !== opts.merchantId) {
    return { ok: false as const, error: "That order belongs to a different store." };
  }
  if (order.status === "FULFILLED") {
    return { ok: false as const, error: `Order ${order.reference} has already been fulfilled and cannot be cancelled.` };
  }
  if (order.status === "CANCELLED") {
    return { ok: true as const, order };
  }

  // Restore inventory stock and mark CANCELLED
  const updated = await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      if (item.productId) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
    return tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
      include: { items: true },
    });
  });

  return { ok: true as const, order: updated };
}
