import type { Tx } from "../config/db.js";

/**
 * Atomic stock operations. Each is a single conditional UPDATE, so two buyers
 * racing for the last unit can't both win: Postgres re-checks the WHERE clause
 * after acquiring the row lock, and the loser's update matches zero rows.
 *
 * Sellable units = stock - reserved.
 */

/** Hold `qty` units for an unpaid order. Returns false if not enough are available. */
export async function reserveStock(tx: Tx, productId: string, qty: number): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "Product" SET "reserved" = "reserved" + ${qty}, "updatedAt" = now()
    WHERE "id" = ${productId} AND "active" = true AND "stock" - "reserved" >= ${qty}`;
  return n === 1;
}

/** Give back held units (reservation expired or order cancelled before payment). */
export async function releaseStock(tx: Tx, productId: string, qty: number): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Product" SET "reserved" = GREATEST("reserved" - ${qty}, 0), "updatedAt" = now()
    WHERE "id" = ${productId}`;
}

/** Payment verified: the held units leave the shelf. Returns false if the hold was missing. */
export async function finalizeReservedStock(tx: Tx, productId: string, qty: number): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "Product" SET "stock" = "stock" - ${qty}, "reserved" = "reserved" - ${qty}, "updatedAt" = now()
    WHERE "id" = ${productId} AND "reserved" >= ${qty} AND "stock" >= ${qty}`;
  return n === 1;
}

/** Immediate sale (WhatsApp orders): take `qty` units that aren't held by anyone else. */
export async function takeAvailableStock(tx: Tx, productId: string, qty: number): Promise<boolean> {
  const n = await tx.$executeRaw`
    UPDATE "Product" SET "stock" = "stock" - ${qty}, "updatedAt" = now()
    WHERE "id" = ${productId} AND "stock" - "reserved" >= ${qty}`;
  return n === 1;
}

export const available = (p: { stock: number; reserved: number }) => Math.max(0, p.stock - p.reserved);
