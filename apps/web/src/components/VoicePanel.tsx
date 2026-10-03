import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon, Activity01Icon, CreditCardIcon, Call02Icon } from "@hugeicons/core-free-icons";
import { api, type ActivityEvent, type Integrations } from "../api";

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

type Tone = "ok" | "warn" | "off";
const DOT: Record<Tone, string> = { ok: "bg-mint", warn: "bg-honey", off: "bg-slate-600" };

function Row({ icon, label, value, tone }: { icon: any; label: string; value: string; tone: Tone }) {
  return (
    <li className="flex items-start gap-3">
      <HugeiconsIcon icon={icon} size={16} className="mt-0.5 shrink-0 text-slate-500" strokeWidth={2} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-sm text-slate-200">{value}</div>
      </div>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} aria-hidden />
    </li>
  );
}

/**
 * Voice commerce status + live activity. Every state shown here comes from the
 * server's actual configuration - nothing is assumed live.
 */
export function VoicePanel({ merchantId, activity }: { merchantId: string | null; activity: ActivityEvent[] }) {
  const [cfg, setCfg] = useState<Integrations | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .integrations()
        .then((c) => !cancelled && (setCfg(c), setCfgError(null)))
        .catch((e) => !cancelled && setCfgError(e instanceof Error ? e.message : "unavailable"));
    load();
    const t = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const voice = cfg?.voice;
  const sellsHere = voice?.storeId && voice.storeId === merchantId;

  return (
    <div className="rounded-2xl border border-ink-500/70 bg-ink-700/80 shadow-card backdrop-blur-sm">
      <div className="flex items-center gap-2.5 border-b border-ink-500/70 px-5 py-4">
        <HugeiconsIcon icon={Mic01Icon} size={18} className="text-violet-300" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-white">Voice ordering</h2>
      </div>

      <div className="p-5">
        {cfgError ? (
          <p className="text-xs text-rose-300">Couldn't load integration status ({cfgError}). Retrying…</p>
        ) : !cfg ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-ink-600/60" />
            ))}
          </div>
        ) : (
          <ul className="space-y-3.5">
            <Row
              icon={Call02Icon}
              label="Voice agent tools"
              value={
                voice!.toolsConfigured
                  ? sellsHere
                    ? `Live for this store${voice!.phoneNumber ? ` · ${voice!.phoneNumber}` : ""}`
                    : `Selling for ${voice!.storeName ?? "another store"}`
                  : `Not configured - ${voice!.problem}`
              }
              tone={voice!.toolsConfigured ? (sellsHere ? "ok" : "warn") : "off"}
            />
            <Row
              icon={CreditCardIcon}
              label="Payments"
              value={
                cfg.payments.provider
                  ? `Paystack ${cfg.payments.mode} mode${cfg.payments.mode === "test" ? " - no real money" : ""}`
                  : "Not configured - voice orders stay reserved, then expire"
              }
              tone={cfg.payments.provider ? (cfg.payments.mode === "test" ? "warn" : "ok") : "off"}
            />
          </ul>
        )}
        {cfg && (
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Voice orders reserve stock for {cfg.reservationMinutes} min. Checkout links appear on the order below for the store to share; only a payment verified with Paystack confirms an order.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2.5 border-y border-ink-500/70 px-5 py-3">
        <HugeiconsIcon icon={Activity01Icon} size={16} className="text-honey" strokeWidth={2} />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Activity</h3>
      </div>
      <div className="max-h-80 overflow-y-auto p-5">
        {activity.length === 0 ? (
          <p className="py-2 text-center text-xs text-slate-500">No activity yet. Quotes, reservations and payments appear here.</p>
        ) : (
          <ul className="space-y-3">
            {activity.map((e) => (
              <li key={e.id} className="animate-fadeIn text-xs">
                <div className="text-slate-300">{e.message}</div>
                <div className="mt-0.5 text-slate-500">{timeAgo(e.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
