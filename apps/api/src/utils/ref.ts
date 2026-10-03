/** Generate a short, human-readable order reference, e.g. HIVE-7Q2K9F. */
export function orderReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `HIVE-${s}`;
}

/** Normalize a phone number to a bare E.164-ish digit string (no +, no spaces). */
export function normalizePhone(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/**
 * Normalize a spoken/typed Nigerian number to the same digits-only E.164 form
 * WhatsApp gives us: "0803 123 4567" -> "2348031234567". Returns null if it
 * doesn't look like a phone number.
 */
export function normalizeCallerPhone(raw: string): string | null {
  let d = normalizePhone(raw);
  if (d.length === 11 && d.startsWith("0")) d = `234${d.slice(1)}`;
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/** Unique payment reference for a provider checkout, e.g. HIVE-7Q2K9F-P3XA. */
export function paymentReference(orderRef: string): string {
  return `${orderRef}-${orderReference().slice(5, 9)}`;
}
