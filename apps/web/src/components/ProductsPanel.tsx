import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PackageIcon, Tag01Icon, PlusSignIcon, Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { api, type Product } from "../api";

function stockTone(available: number) {
  if (available <= 0) return { text: "Out of stock", cls: "text-rose-400 bg-rose-500/10" };
  if (available <= 5) return { text: `${available} left`, cls: "text-honey bg-honey/10" };
  return { text: `${available} in stock`, cls: "text-mint bg-mint/10" };
}

const variantLabel = (p: Product) => [p.color, p.size ? `Size ${p.size}` : null].filter(Boolean).join(" · ");

export function ProductsPanel({
  products,
  merchantId,
  onProductAdded,
}: {
  products: Product[];
  merchantId?: string | null;
  onProductAdded?: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    priceNaira: "",
    stock: "10",
    color: "",
    size: "",
    description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantId) return;
    setError(null);
    setSubmitting(true);

    try {
      await api.createProduct(merchantId, {
        name: form.name.trim(),
        priceNaira: parseFloat(form.priceNaira) || 0,
        stock: parseInt(form.stock, 10) || 0,
        color: form.color.trim() || undefined,
        size: form.size.trim() || undefined,
        description: form.description.trim() || undefined,
      });

      setModalOpen(false);
      setForm({ name: "", priceNaira: "", stock: "10", color: "", size: "", description: "" });
      onProductAdded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-ink-500/70 bg-ink-700 shadow-card">
      <div className="flex items-center justify-between border-b border-ink-500/70 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <HugeiconsIcon icon={PackageIcon} size={18} className="text-violet-300" strokeWidth={2} />
          <h2 className="text-sm font-semibold text-white">Inventory & Products</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{products.length} products</span>
          {merchantId && (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-honey/15 px-3 py-1.5 text-xs font-semibold text-honey transition-all hover:bg-honey/25"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2.5} />
              Add Product
            </button>
          )}
        </div>
      </div>

      {products.length === 0 ? (
        <p className="px-5 py-12 text-center text-xs text-slate-500">
          No products yet - click "Add Product" above or add them through WhatsApp/Voice.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const tone = stockTone(p.available);
            const variant = variantLabel(p);
            return (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-ink-500/60 bg-ink-600/40 p-3 transition-colors hover:border-ink-500"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-ink-500">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <HugeiconsIcon icon={Tag01Icon} size={18} className="text-slate-500" strokeWidth={1.8} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{p.name}</div>
                  {variant && <div className="truncate text-xs text-slate-400">{variant}</div>}
                  <div className="text-sm font-semibold text-honey">{p.price}</div>
                  {p.reserved > 0 && (
                    <div className="text-[11px] text-sky-300">
                      {p.stock} on hand · {p.reserved} reserved
                    </div>
                  )}
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${tone.cls}`}>
                  {tone.text}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-ink-500/80 bg-ink-800 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink-500/60 pb-3">
              <h3 className="text-base font-semibold text-white">Add New Product</h3>
              <button
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-ink-700 hover:text-white"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
              </button>
            </div>

            {error && (
              <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ankara Silk Gown"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-ink-500/80 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-honey focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Price (₦) *</label>
                  <input
                    type="number"
                    required
                    min="100"
                    step="100"
                    placeholder="18500"
                    value={form.priceNaira}
                    onChange={(e) => setForm({ ...form, priceNaira: e.target.value })}
                    className="w-full rounded-lg border border-ink-500/80 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-honey focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Stock Units *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="10"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: e.target.value })}
                    className="w-full rounded-lg border border-ink-500/80 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-honey focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Color / Pattern</label>
                  <input
                    type="text"
                    placeholder="e.g. Black, Gold, Floral"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="w-full rounded-lg border border-ink-500/80 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-honey focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Size</label>
                  <input
                    type="text"
                    placeholder="e.g. 10, 12, L, Free"
                    value={form.size}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    className="w-full rounded-lg border border-ink-500/80 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-honey focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-300">Short Description</label>
                <input
                  type="text"
                  placeholder="e.g. Handcrafted Ankara party wear"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-ink-500/80 bg-ink-900/60 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-honey focus:outline-none"
                />
              </div>

              <div className="mt-5 flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-lg bg-honey px-4 py-2 text-xs font-semibold text-ink-900 hover:bg-amber-300 disabled:opacity-50"
                >
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} strokeWidth={2} />
                  {submitting ? "Adding..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
