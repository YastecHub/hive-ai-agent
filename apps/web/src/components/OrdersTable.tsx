import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShoppingCart01Icon, InvoiceIcon, ArrowLeft01Icon, ArrowRight01Icon, Mic01Icon } from "@hugeicons/core-free-icons";
import type { Order } from "../api";
import { StatusBadge } from "./StatusBadge";

const PAGE_SIZE = 8;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Small "Voice" chip so phone/web-voice orders stand out from WhatsApp ones. */
function ChannelTag({ channel }: { channel: Order["channel"] }) {
  if (channel !== "voice") return null;
  return (
    <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-violet-400/10 px-1.5 py-0.5 align-middle font-sans text-[10px] font-medium text-violet-300">
      <HugeiconsIcon icon={Mic01Icon} size={11} strokeWidth={2} />
      Voice
    </span>
  );
}

import { api } from "../api";

/** Payment state under the status badge. Silent for WhatsApp orders (paid off-platform). */
function PaymentNote({
  order,
  merchantId,
  onOrderUpdated,
}: {
  order: Order;
  merchantId?: string | null;
  onOrderUpdated?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText("9068913009");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const confirmTransfer = async () => {
    if (!merchantId || verifying) return;
    setVerifying(true);
    try {
      await api.simulatePayment(merchantId, order.reference);
      onOrderUpdated?.();
    } catch (err) {
      console.error(err);
    } finally {
      setVerifying(false);
    }
  };

  const note: Partial<Record<Order["paymentStatus"], { text: string; cls: string }>> = {
    UNPAID: { text: "Awaiting transfer · OPay: 9068913009", cls: "text-amber-300 font-mono font-medium" },
    PENDING: { text: "Checkout opened", cls: "text-sky-300" },
    PAID: { text: "Paid (verified via OPay)", cls: "text-mint font-semibold" },
    NEEDS_REVIEW: { text: "Paid after expiry - review", cls: "text-rose-400" },
  };
  const n = note[order.paymentStatus];
  if (!n) return null;
  return (
    <div className={`mt-1 text-[11px] ${n.cls}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span>{n.text}</span>
        {order.paymentStatus === "UNPAID" && (
          <>
            <button
              onClick={copy}
              className="rounded bg-honey/20 px-1.5 py-0.5 text-[10px] font-bold text-honey hover:bg-honey hover:text-ink-900 transition-colors"
              title="Copy OPay account number"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
            {merchantId && (
              <button
                onClick={confirmTransfer}
                disabled={verifying}
                className="rounded bg-mint/20 px-1.5 py-0.5 text-[10px] font-bold text-mint hover:bg-mint hover:text-ink-900 transition-colors disabled:opacity-50"
                title="Mark this transfer received & confirmed"
              >
                {verifying ? "Verifying..." : "✓ Confirm Payment"}
              </button>
            )}
          </>
        )}
      </div>
      {order.checkoutUrl && (
        <div className="mt-0.5">
          <a href={order.checkoutUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-honey">
            checkout link
          </a>
        </div>
      )}
    </div>
  );
}

export function OrdersTable({
  orders,
  merchantId,
  onOrderUpdated,
}: {
  orders: Order[];
  merchantId?: string | null;
  onOrderUpdated?: () => void;
}) {
  const [page, setPage] = useState(0);

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const pageOrders = orders.slice(start, start + PAGE_SIZE);

  return (
    <div className="rounded-2xl border border-ink-500/70 bg-ink-700 shadow-card">
      <div className="flex items-center justify-between border-b border-ink-500/70 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <HugeiconsIcon icon={ShoppingCart01Icon} size={18} className="text-honey" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-white">Recent Orders</h2>
        </div>
        <span className="text-xs text-slate-500">{orders.length} total</span>
      </div>

      {orders.length === 0 ? (
        <EmptyOrders />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-medium">Reference</th>
                  <th className="px-5 py-3 font-medium">Customer</th>
                  <th className="px-5 py-3 font-medium">Items</th>
                  <th className="px-5 py-3 font-medium">Total</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {pageOrders.map((o) => (
                  <tr key={o.reference} className="border-t border-ink-600/60 animate-fadeIn hover:bg-ink-600/40">
                    <td className="px-5 py-3 font-mono text-xs font-medium text-honey">
                      {o.reference}
                      <ChannelTag channel={o.channel} />
                    </td>
                    <td className="px-5 py-3 text-slate-300">{o.customer ?? "-"}</td>
                    <td className="px-5 py-3 text-slate-400">
                      {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                    </td>
                    <td className="px-5 py-3 font-semibold text-white">{o.total}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={o.status} />
                      <PaymentNote order={o} merchantId={merchantId} onOrderUpdated={onOrderUpdated} />
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-slate-500">{timeAgo(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="divide-y divide-ink-600/60 md:hidden">
            {pageOrders.map((o) => (
              <div key={o.reference} className="animate-fadeIn px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-medium text-honey">
                    {o.reference}
                    <ChannelTag channel={o.channel} />
                  </span>
                  <span className="shrink-0">
                    <StatusBadge status={o.status} />
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-slate-300">{o.customer ?? "-"}</span>
                  <span className="shrink-0 font-semibold text-white">{o.total}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")} · {timeAgo(o.createdAt)}
                </div>
                <PaymentNote order={o} merchantId={merchantId} onOrderUpdated={onOrderUpdated} />
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-ink-500/70 px-5 py-3">
              <span className="text-xs text-slate-500">
                Showing {start + 1}–{Math.min(start + PAGE_SIZE, orders.length)} of {orders.length}
              </span>
              <div className="flex items-center gap-1.5">
                <PageButton
                  icon={ArrowLeft01Icon}
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                  label="Previous"
                />
                <span className="px-2 text-xs font-medium text-slate-400">
                  {safePage + 1} / {totalPages}
                </span>
                <PageButton
                  icon={ArrowRight01Icon}
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage(safePage + 1)}
                  label="Next"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PageButton({ icon, disabled, onClick, label }: { icon: any; disabled: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-500 bg-ink-700 text-slate-300 transition-colors hover:border-honey/60 hover:text-honey disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-ink-500 disabled:hover:text-slate-300"
    >
      <HugeiconsIcon icon={icon} size={16} strokeWidth={2} />
    </button>
  );
}

function EmptyOrders() {
  return (
    <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
      <HugeiconsIcon icon={InvoiceIcon} size={32} className="text-slate-600" strokeWidth={1.6} />
      <p className="mt-3 text-sm font-medium text-slate-400">No orders yet</p>
      <p className="mt-1 max-w-xs text-xs text-slate-500">
        When a customer orders over WhatsApp or by voice, it will appear here in real time.
      </p>
    </div>
  );
}
