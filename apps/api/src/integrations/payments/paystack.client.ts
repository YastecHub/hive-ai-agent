import crypto from "node:crypto";
import axios from "axios";
import { env } from "../../config/env.js";

const http = axios.create({
  baseURL: "https://api.paystack.co",
  timeout: 15_000,
});

const auth = () => ({ Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` });

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/** Start a hosted checkout. `amountKobo` must come from the server-owned order. */
export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializeResult> {
  const res = await http.post(
    "/transaction/initialize",
    {
      email: input.email,
      amount: input.amountKobo,
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
    { headers: auth() },
  );
  return res.data.data as InitializeResult;
}

export interface VerifiedTransaction {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number; // kobo
  currency: string;
  domain: string; // "test" | "live"
  paid_at: string | null;
}

/** Ask Paystack directly what happened to a reference. The only source we trust for "paid". */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const res = await http.get(`/transaction/verify/${encodeURIComponent(reference)}`, { headers: auth() });
  return res.data.data as VerifiedTransaction;
}

/** Check the x-paystack-signature header: HMAC-SHA512 of the raw request body with the secret key. */
export function isValidSignature(rawBody: Buffer | undefined, signature: string | undefined, secret = env.PAYSTACK_SECRET_KEY): boolean {
  if (!rawBody || !signature || !secret) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
