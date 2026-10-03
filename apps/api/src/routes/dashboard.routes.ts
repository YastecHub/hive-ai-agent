import { Router } from "express";
import { prisma } from "../config/db.js";
import { getAnalytics } from "../services/analytics.service.js";
import { listProducts } from "../services/product.service.js";
import { formatNaira } from "../utils/money.js";
import { env, features } from "../config/env.js";
import { listActivity } from "../services/activity.service.js";
import { available } from "../services/inventory.service.js";
import { normalizePhone } from "../utils/ref.js";

/**
 * Read-only REST endpoints for the (secondary) web dashboard. The primary UX is
 * WhatsApp; these power charts and tables.
 */
export const dashboardRouter = Router();

dashboardRouter.get("/merchants", async (_req, res, next) => {
  try {
    // Onboarded (named) stores first, then oldest - so the real demo store leads.
    const merchants = await prisma.merchant.findMany({
      orderBy: [{ onboarded: "desc" }, { createdAt: "asc" }],
    });
    res.json(merchants.map((m) => ({ id: m.id, businessName: m.businessName, phone: m.whatsappPhone, onboarded: m.onboarded })));
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/merchants/:id/overview", async (req, res, next) => {
  try {
    const merchant = await prisma.merchant.findUnique({ where: { id: req.params.id } });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });
    const analytics = await getAnalytics(merchant.id);
    res.json({ merchant: { id: merchant.id, businessName: merchant.businessName }, analytics });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/merchants/:id/products", async (req, res, next) => {
  try {
    const products = await listProducts(req.params.id, true);
    res.json(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        price: formatNaira(p.priceKobo),
        priceKobo: p.priceKobo,
        stock: p.stock,
        reserved: p.reserved,
        available: available(p),
        color: p.color,
        size: p.size,
        active: p.active,
        imageUrl: p.imageUrl,
      })),
    );
  } catch (err) {
    next(err);
  }
});

dashboardRouter.post("/merchants/:id/products", async (req, res, next) => {
  try {
    const { name, priceNaira, stock, color, size, description, imageUrl, sku } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "Product name is required" });
    }
    const price = Number(priceNaira);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({ error: "Valid price in Naira is required" });
    }

    const created = await prisma.product.create({
      data: {
        merchantId: req.params.id,
        name: name.trim(),
        priceKobo: Math.round(price * 100),
        stock: Math.max(0, parseInt(String(stock ?? 0), 10) || 0),
        color: color ? String(color).trim() : null,
        size: size ? String(size).trim() : null,
        description: description ? String(description).trim() : null,
        imageUrl: imageUrl ? String(imageUrl).trim() : null,
        sku: sku ? String(sku).trim() : null,
      },
    });

    res.status(201).json({
      id: created.id,
      name: created.name,
      price: formatNaira(created.priceKobo),
      priceKobo: created.priceKobo,
      stock: created.stock,
      reserved: created.reserved,
      available: available(created),
      color: created.color,
      size: created.size,
      active: created.active,
      imageUrl: created.imageUrl,
    });
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/merchants/:id/orders", async (req, res, next) => {
  try {
    const orders = await prisma.order.findMany({
      where: { merchantId: req.params.id },
      include: { items: true, customer: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(
      orders.map((o) => ({
        reference: o.reference,
        status: o.status,
        total: formatNaira(o.totalKobo),
        totalKobo: o.totalKobo,
        customer: o.customer?.name ?? o.customer?.whatsappPhone ?? null,
        items: o.items.map((i) => ({ name: i.nameSnapshot, quantity: i.quantity })),
        channel: o.channel,
        fulfilment: o.fulfilment,
        paymentStatus: o.paymentStatus,
        checkoutUrl: o.status === "RESERVED" ? o.checkoutUrl : null,
        reservationExpiresAt: o.reservationExpiresAt,
        createdAt: o.createdAt,
      })),
    );
  } catch (err) {
    next(err);
  }
});

dashboardRouter.get("/merchants/:id/activity", async (req, res, next) => {
  try {
    const events = await listActivity(req.params.id, 30);
    res.json(
      events.map((e) => ({ id: e.id, type: e.type, message: e.message, orderReference: e.order?.reference ?? null, createdAt: e.createdAt })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * Which integrations are actually configured on this server, so the console can
 * show truthful states instead of implying a live voice line or payments.
 */
dashboardRouter.get("/integrations", async (_req, res, next) => {
  try {
    const store = env.VOICE_STORE_PHONE
      ? await prisma.merchant.findUnique({ where: { whatsappPhone: env.VOICE_STORE_PHONE.replace(/[^\d]/g, "") } })
      : null;
    res.json({
      voice: {
        toolsConfigured: features.voiceTools && Boolean(store),
        storeId: store?.id ?? null,
        storeName: store?.businessName ?? null,
        phoneNumber: env.VOICE_PHONE_NUMBER || null,
        merchantToolsConfigured: features.merchantVoiceTools && Boolean(store),
        problem: !env.VOICE_TOOL_KEY
          ? "VOICE_TOOL_KEY not set"
          : !env.VOICE_STORE_PHONE
            ? "VOICE_STORE_PHONE not set"
            : !store
              ? "VOICE_STORE_PHONE does not match a store"
              : null,
      },
      payments: { provider: features.paystack ? "paystack" : null, mode: features.paystackMode },
      whatsapp: { configured: features.whatsapp, provider: features.whatsappProvider },
      reservationMinutes: env.RESERVATION_TTL_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});
