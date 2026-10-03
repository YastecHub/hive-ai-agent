import { prisma } from "../config/db.js";

/** Revenue + order counts for a merchant over the last `days` days. */
export async function getAnalytics(merchantId: string, days = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const activeOrders = await prisma.order.findMany({
    where: { merchantId, status: { in: ["CONFIRMED", "FULFILLED"] }, updatedAt: { gte: since } },
    include: { items: true },
  });

  const revenueKobo = activeOrders.reduce((sum, o) => sum + o.totalKobo, 0);
  const orderCount = activeOrders.length;
  const avgOrderKobo = orderCount ? Math.round(revenueKobo / orderCount) : 0;

  // Top products by units sold in the window.
  const unitsByProduct = new Map<string, { name: string; units: number; revenueKobo: number }>();
  for (const o of activeOrders) {
    for (const it of o.items) {
      const key = it.nameSnapshot;
      const cur = unitsByProduct.get(key) ?? { name: key, units: 0, revenueKobo: 0 };
      cur.units += it.quantity;
      cur.revenueKobo += it.priceKobo * it.quantity;
      unitsByProduct.set(key, cur);
    }
  }
  const topProducts = [...unitsByProduct.values()]
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  const [totalProducts, totalCustomers, pendingOrders] = await Promise.all([
    prisma.product.count({ where: { merchantId, active: true } }),
    prisma.customer.count({ where: { merchantId } }),
    prisma.order.count({ where: { merchantId, status: "CONFIRMED" } }),
  ]);

  return {
    windowDays: days,
    revenueKobo,
    orderCount,
    avgOrderKobo,
    pendingOrders,
    totalProducts,
    totalCustomers,
    topProducts,
  };
}

