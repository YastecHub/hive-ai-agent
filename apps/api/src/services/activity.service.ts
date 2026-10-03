import type { Prisma } from "@prisma/client";
import { prisma, type Tx } from "../config/db.js";

export interface ActivityInput {
  merchantId: string;
  orderId?: string;
  type: string;
  message: string;
  data?: Prisma.InputJsonValue;
}

/** Append a business event to the merchant's activity log. Pass `tx` to write inside a transaction. */
export async function logActivity(input: ActivityInput, tx?: Tx) {
  const db = tx ?? prisma;
  return db.activity.create({ data: input });
}

export async function listActivity(merchantId: string, limit = 30) {
  return prisma.activity.findMany({
    where: { merchantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { order: { select: { reference: true } } },
  });
}
