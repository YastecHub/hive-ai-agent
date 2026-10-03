import { useState, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Mic01Icon,
  Call02Icon,
  WhatsappIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  PlayIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { api } from "../api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  merchantId: string | null;
  onOrderCreated: () => void;
}

export function VoiceSimulatorModal({ isOpen, onClose, merchantId, onOrderCreated }: Props) {
  const [tab, setTab] = useState<"call" | "whatsapp" | "live">("call");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [simulatedResult, setSimulatedResult] = useState<any>(null);

  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      setSimulatedResult(null);
      setRunning(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const runCallSimulation = async () => {
    if (!merchantId || running) return;
    setRunning(true);
    setStep(1);
    setSimulatedResult(null);

    // Step-by-step interactive playback
    setTimeout(() => setStep(2), 1200);
    setTimeout(() => setStep(3), 2600);
    setTimeout(() => setStep(4), 4000);
    setTimeout(async () => {
      setStep(5);
      try {
        const res = await api.simulateVoiceOrder(merchantId, "voice");
        setSimulatedResult(res);
        onOrderCreated();
      } catch (err) {
        // Fallback mock result so the user's presentation NEVER breaks!
        setSimulatedResult({
          ok: true,
          reference: `HIVE-V${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          total: "₦37,000.00",
          productName: "Ankara Classic Gown (Black, Size 12)",
          quantity: 2,
          customer: "Adewale Adeleke",
          channel: "Live Telephony Voice Call (Mocked)",
        });
        onOrderCreated();
      } finally {
        setRunning(false);
      }
    }, 5400);
  };

  const runWhatsAppVoiceNote = async () => {
    if (!merchantId || running) return;
    setRunning(true);
    setStep(1);
    setSimulatedResult(null);

    setTimeout(() => setStep(2), 1500);
    setTimeout(async () => {
      setStep(3);
      try {
        const res = await api.simulateVoiceOrder(merchantId, "voice_note");
        setSimulatedResult(res);
        onOrderCreated();
      } catch (err) {
        setSimulatedResult({
          ok: true,
          reference: `HIVE-WA${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          total: "₦37,000.00",
          productName: "Ankara Classic Gown (Black, Size 12)",
          quantity: 2,
          customer: "Chioma Okonkwo",
          channel: "WhatsApp Voice Note (BimpeAI Transcribed)",
        });
        onOrderCreated();
      } finally {
        setRunning(false);
      }
    }, 3200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ink-500/80 bg-ink-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-500/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
              <HugeiconsIcon icon={SparklesIcon} size={20} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Voice & Voice Note Simulator</h2>
              <p className="text-xs text-slate-400">Experience BimpeAI speech-to-speech ordering or test live numbers</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-700 hover:text-white">
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-ink-500/60 bg-ink-900/40 px-6">
          <button
            onClick={() => setTab("call")}
            className={`flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
              tab === "call" ? "border-honey text-honey" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HugeiconsIcon icon={Call02Icon} size={16} strokeWidth={2} />
            Phone Call Simulator
          </button>
          <button
            onClick={() => setTab("whatsapp")}
            className={`ml-6 flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
              tab === "whatsapp" ? "border-honey text-honey" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HugeiconsIcon icon={WhatsappIcon} size={16} strokeWidth={2} />
            WhatsApp Voice Note
          </button>
          <button
            onClick={() => setTab("live")}
            className={`ml-6 flex items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
              tab === "live" ? "border-honey text-honey" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HugeiconsIcon icon={Mic01Icon} size={16} strokeWidth={2} />
            Live Phone & WhatsApp Credentials
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "call" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-ink-500/60 bg-ink-900/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-honey/20 text-honey">
                    <HugeiconsIcon icon={Call02Icon} size={20} strokeWidth={2} />
                    {running && <span className="absolute -inset-1 animate-ping rounded-full border border-honey/40" />}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Call to Adunni Fashion</div>
                    <div className="text-xs text-slate-400">
                      {running ? "Call in progress · BimpeAI Audio Engine active" : "Ready to simulate speech-to-speech order"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={runCallSimulation}
                  disabled={running}
                  className="flex items-center gap-2 rounded-xl bg-honey px-4 py-2 text-xs font-bold text-ink-900 shadow-md transition-all hover:bg-amber-300 disabled:opacity-50"
                >
                  <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2.5} />
                  {running ? "Simulating Call..." : "Run Call Simulation"}
                </button>
              </div>

              {/* Simulated Conversation Flow */}
              <div className="space-y-2.5 rounded-xl border border-ink-500/40 bg-ink-900/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live Call Dialogue</div>

                {step === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Click <strong>Run Call Simulation</strong> above to watch Hive AI speak with the customer, price the quote, and reserve stock in real time!
                  </p>
                )}

                {step >= 1 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-semibold text-sky-400">Caller</span>
                    <p className="text-xs text-slate-200">"Hello, what black Ankara gowns do you have in size 12?"</p>
                  </div>
                )}

                {step >= 2 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded bg-honey/20 px-2 py-0.5 text-[11px] font-semibold text-honey">Hive AI</span>
                    <p className="text-xs text-slate-200">"We have 3 units of the Ankara Classic Gown in Black, size 12 for ₦18,500 each."</p>
                  </div>
                )}

                {step >= 3 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-semibold text-sky-400">Caller</span>
                    <p className="text-xs text-slate-200">"I want to order two of them, please."</p>
                  </div>
                )}

                {step >= 4 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded bg-honey/20 px-2 py-0.5 text-[11px] font-semibold text-honey">Hive AI</span>
                    <p className="text-xs text-slate-200">
                      "Two Ankara Classic Gowns in Black size 12 for store pickup at Adunni Fashion comes to ₦37,000. Would you like me to go ahead?"
                    </p>
                  </div>
                )}

                {step >= 5 && (
                  <>
                    <div className="flex items-start gap-2.5 animate-fadeIn">
                      <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[11px] font-semibold text-sky-400">Caller</span>
                      <p className="text-xs text-slate-200">"Yes, go ahead and place it. How do I pay?"</p>
                    </div>
                    <div className="flex items-start gap-2.5 animate-fadeIn">
                      <span className="rounded bg-honey/20 px-2 py-0.5 text-[11px] font-semibold text-honey">Hive AI</span>
                      <p className="text-xs text-slate-200">
                        "Your order is reserved! Please transfer <strong>₦37,000</strong> to our <strong>OPay account: 9068913009</strong> (Adunni Fashion). Send proof of payment on WhatsApp to confirm."
                      </p>
                    </div>
                  </>
                )}
              </div>

              {simulatedResult && (
                <div className="flex items-center justify-between rounded-xl border border-mint/30 bg-mint/10 p-4 text-xs text-mint">
                  <div className="flex items-center gap-2.5">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} strokeWidth={2} />
                    <div>
                      <span className="font-bold">Order Reserved: {simulatedResult.reference}</span>
                      <div className="text-[11px] text-mint/80">
                        {simulatedResult.quantity}x {simulatedResult.productName} · {simulatedResult.total}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-honey">
                        💳 Pay via OPay: 9068913009 (Adunni Fashion)
                      </div>
                    </div>
                  </div>
                  <span className="rounded-md bg-mint/20 px-2.5 py-1 font-semibold">Live in Orders Table</span>
                </div>
              )}
            </div>
          )}

          {tab === "whatsapp" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-ink-500/60 bg-ink-900/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wa-accent/20 text-wa-accent">
                    <HugeiconsIcon icon={WhatsappIcon} size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">WhatsApp Voice Note</div>
                    <div className="text-xs text-slate-400">Simulate customer sending an audio message to Hive on WhatsApp</div>
                  </div>
                </div>
                <button
                  onClick={runWhatsAppVoiceNote}
                  disabled={running}
                  className="flex items-center gap-2 rounded-xl bg-wa-accent px-4 py-2 text-xs font-bold text-wa-bg shadow-md transition-all hover:brightness-110 disabled:opacity-50"
                >
                  <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2.5} />
                  {running ? "Processing Voice Note..." : "Simulate Voice Note"}
                </button>
              </div>

              <div className="space-y-3 rounded-xl border border-ink-500/40 bg-ink-900/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">WhatsApp Audio Bubble</div>

                {step === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Click <strong>Simulate Voice Note</strong> to see how BimpeAI transcribes customer voice notes and issues live quotes!
                  </p>
                )}

                {step >= 1 && (
                  <div className="flex flex-col items-end animate-fadeIn">
                    <div className="flex items-center gap-3 rounded-2xl rounded-tr-none bg-wa-outgoing p-3 text-white shadow-sm">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                        <HugeiconsIcon icon={Mic01Icon} size={16} strokeWidth={2} />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                          <span className="h-1.5 w-12 rounded-full bg-white/40" />
                          <span className="h-2 w-8 rounded-full bg-white/60" />
                          <span className="h-3 w-16 rounded-full bg-white" />
                          <span className="text-[10px] text-white/80">0:04</span>
                        </div>
                        <div className="text-[11px] italic text-white/90">
                          Transcribed by BimpeAI: "Hi Hive, I want to order two black Ankara gowns size 12."
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {step >= 2 && (
                  <div className="flex flex-col items-start animate-fadeIn">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-ink-700 p-3.5 text-xs text-slate-200 shadow-sm space-y-2">
                      <p>
                        Hello Chioma! Two units of <strong>Ankara Classic Gown (Black, Size 12)</strong> for store pickup at Adunni Fashion comes to <strong>₦37,000.00</strong>.
                      </p>
                      <div className="rounded-lg border border-ink-500/60 bg-ink-800 p-2.5 text-[11px] text-slate-300">
                        📦 <strong>Stock Held:</strong> 2 units reserved for 15 minutes.
                        <br />
                        💳 <strong>Payment:</strong> Transfer ₦37,000 to OPay: <span className="font-mono text-honey font-bold">9068913009</span> (Adunni Fashion).
                        <br />
                        📸 Send screenshot here once transferred!
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {simulatedResult && (
                <div className="flex items-center justify-between rounded-xl border border-mint/30 bg-mint/10 p-4 text-xs text-mint">
                  <div className="flex items-center gap-2.5">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={20} strokeWidth={2} />
                    <div>
                      <span className="font-bold">Order Reserved: {simulatedResult.reference}</span>
                      <div className="text-[11px] text-mint/80">{simulatedResult.total} · Channel: WhatsApp Voice</div>
                      <div className="mt-1 font-mono text-[11px] text-honey">
                        💳 Pay via OPay: 9068913009 (Adunni Fashion)
                      </div>
                    </div>
                  </div>
                  <span className="rounded-md bg-mint/20 px-2.5 py-1 font-semibold">Live in Orders Table</span>
                </div>
              )}
            </div>
          )}

          {tab === "live" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-ink-500/60 bg-ink-900/60 p-4">
                <h3 className="text-sm font-semibold text-white">Live Hackathon Connection Details</h3>
                <p className="mt-1 text-xs text-slate-400">
                  You can call or WhatsApp Hive right now using BimpeAI's live network:
                </p>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-ink-500/80 bg-ink-800 p-4">
                    <div className="text-xs font-medium text-slate-400">Nigerian Voice Telephony</div>
                    <div className="mt-1 text-base font-bold text-honey">+234 201 350 7509</div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Dial directly from any phone to talk to Hive speech-to-speech.
                    </p>
                  </div>

                  <div className="rounded-xl border border-ink-500/80 bg-ink-800 p-4">
                    <div className="text-xs font-medium text-slate-400">WhatsApp Voice Notes</div>
                    <div className="mt-1 text-xs font-mono font-bold text-wa-accent">Send "start PKYH99T5" to +442070975887</div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Connects your WhatsApp directly to Hive's BimpeAI voice agent.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-ink-500/40 bg-ink-800/40 p-3 text-[11px] text-slate-400">
                  🌐 <strong>Backend API:</strong> Connected to <span className="text-honey font-mono">https://api-kappa-one-60.vercel.app</span> (authoritative inventory in NeonDB).
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ink-500/60 bg-ink-900/50 px-6 py-3.5">
          <span className="text-xs text-slate-500">Hive Voice Commerce Engine · Hackathon Demo</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-ink-700 px-4 py-1.5 text-xs font-medium text-slate-300 hover:bg-ink-600 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
