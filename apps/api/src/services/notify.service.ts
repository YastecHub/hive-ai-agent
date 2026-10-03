import { prisma } from "../config/db.js";
import { formatNaira } from "../utils/money.js";
import { sendWhatsAppText } from "../integrations/whatsapp/whatsapp.client.js";

/**
 * After an order is placed, notify both the customer (order confirmation) and the
 * merchant (new order alert) on WhatsApp.
 */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true, merchant: true },
  });
  if (!order) return;

  const itemLines = order.items.map((i) => `• ${i.quantity} × ${i.nameSnapshot}`).join("\n");
  const total = formatNaira(order.totalKobo);

  if (order.customer?.whatsappPhone) {
    await sendWhatsAppText(
      order.customer.whatsappPhone,
      `✅ Order confirmed! Your order ${order.reference} has been received.\n\n${itemLines}\n\nTotal: ${total}\n\nThank you for ordering with ${order.merchant.businessName ?? "us"}! 🐝`,
    );
  }

  if (order.merchant?.whatsappPhone) {
    await sendWhatsAppText(
      order.merchant.whatsappPhone,
      `📦 New order! Order ${order.reference} was just placed.\n\n${itemLines}\n\nTotal: ${total}\nStock has been reserved and updated automatically.`,
    );
  }
}

export async function notifyOrderFulfilled(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, customer: true, merchant: true },
  });
  if (!order) return;

  if (order.customer?.whatsappPhone) {
    await sendWhatsAppText(
      order.customer.whatsappPhone,
      `🚚 Great news! Your order ${order.reference} has been fulfilled and is on its way.`,
    );
  }
}
