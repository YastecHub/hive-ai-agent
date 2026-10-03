import { HugeiconsIcon } from "@hugeicons/react";
import {
  CheckmarkCircle01Icon,
  Clock01Icon,
  DeliveryTruck01Icon,
  CancelCircleIcon,
  InvoiceIcon,
  ArrowReloadHorizontalIcon,
} from "@hugeicons/core-free-icons";
import type { OrderStatus } from "../api";

const MAP: Record<OrderStatus, { label: string; cls: string; icon: any }> = {
  RESERVED: { label: "Reserved", cls: "bg-sky-400/10 text-sky-300 border-sky-400/20", icon: Clock01Icon },
  CONFIRMED: { label: "Confirmed", cls: "bg-honey/10 text-honey border-honey/20", icon: CheckmarkCircle01Icon },
  FULFILLED: { label: "Fulfilled", cls: "bg-mint/10 text-mint border-mint/20", icon: DeliveryTruck01Icon },
  CANCELLED: { label: "Cancelled", cls: "bg-rose-500/10 text-rose-400 border-rose-500/20", icon: CancelCircleIcon },
  EXPIRED: { label: "Expired", cls: "bg-slate-500/10 text-slate-400 border-slate-500/20", icon: CancelCircleIcon },
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = MAP[status] ?? MAP.CONFIRMED;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${s.cls}`}
    >
      <HugeiconsIcon icon={s.icon} size={14} strokeWidth={2} />
      {s.label}
    </span>
  );
}
