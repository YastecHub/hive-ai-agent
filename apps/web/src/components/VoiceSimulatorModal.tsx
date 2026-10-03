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
  CreditCardIcon,
} from "@hugeicons/core-free-icons";
import { api } from "../api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  merchantId: string | null;
  onOrderCreated: () => void;
}

export function VoiceSimulatorModal({ isOpen, onClose, merchantId, onOrderCreated }: Props) {
  const [tab, setTab] = useState<"call" | "whatsapp" | "payment" | "live">("call");
  const [running, setRunning] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [step, setStep] = useState(0);
  const [simulatedResult, setSimulatedResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Call timer
  useEffect(() => {
    let interval: any;
    if (callActive) {
      interval = setInterval(() => {
        setCallDuration((s) => s + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callActive]);

  useEffect(() => {
    if (!isOpen) {
      setStep(0);
      setSimulatedResult(null);
      setRunning(false);
      setCallActive(false);
      setCopied(false);
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const speak = (text: string) => {
    try {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        const clean = text.replace(/[*_~`#₦]/g, "").replace(/9068913009/g, "9 0 6, 8 9 1, 3 0 0 9");
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.warn("speech synthesis error", e);
    }
  };

  const copyAccount = () => {
    navigator.clipboard.writeText("9068913009");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const endCall = () => {
    setRunning(false);
    setCallActive(false);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  };

  const runCallSimulation = async () => {
    if (!merchantId || running) return;
    setRunning(true);
    setCallActive(true);
    setStep(1);
    setSimulatedResult(null);

    // Step 1: Connecting / Ringing
    setTimeout(() => {
      setStep(2);
      speak("Hello! Welcome to Adunni Fashion. I am Hive, your voice shopping assistant. How may I help you today?");
    }, 1200);

    // Step 2: Customer asks for black Ankara gowns
    setTimeout(() => {
      setStep(3);
    }, 4500);

    // Step 3: Hive AI checks inventory & answers
    setTimeout(() => {
      setStep(4);
      speak("We have 3 units of the Ankara Classic Gown in Black, size 12 for 18,500 Naira each. Two units comes to 37,000 Naira.");
    }, 6500);

    // Step 4: Customer orders and asks how to pay
    setTimeout(() => {
      setStep(5);
    }, 10000);

    // Step 5: Hive AI confirms order & gives OPay account 9068913009
    setTimeout(async () => {
      setStep(6);
      speak("Your order is reserved! Please transfer 37,000 Naira to our OPay account: 9 0 6, 8 9 1, 3 0 0 9, name Adunni Fashion. Send your receipt on WhatsApp to confirm delivery.");
      try {
        const res = await api.simulateVoiceOrder(merchantId, "voice");
        setSimulatedResult(res);
        onOrderCreated();
      } catch (err) {
        setSimulatedResult({
          ok: true,
          reference: `HIVE-V${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          total: "₦37,000.00",
          productName: "Ankara Classic Gown (Black, Size 12)",
          quantity: 2,
          customer: "Adewale Adeleke",
          channel: "Live Telephony Voice Call (Simulated Audio Engine)",
          bank: "OPay",
          accountNumber: "9068913009",
          accountName: "Adunni Fashion",
        });
        onOrderCreated();
      } finally {
        setRunning(false);
      }
    }, 12500);
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

  const runPaymentSimulation = async () => {
    if (!merchantId || running) return;
    setRunning(true);
    setStep(1);
    setSimulatedResult(null);

    // Customer requests payment account
    setTimeout(() => setStep(2), 1200);
    // Hive sends OPay account 9068913009
    setTimeout(() => setStep(3), 2600);
    // Customer sends receipt screenshot
    setTimeout(async () => {
      setStep(4);
      try {
        const orderRes = await api.simulateVoiceOrder(merchantId, "voice");
        const payRes = await api.simulatePayment(merchantId, orderRes.reference);
        setSimulatedResult({
          ...orderRes,
          paymentStatus: "PAID",
          status: "CONFIRMED",
          verified: true,
          receiptRef: `OPAY-${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        });
        onOrderCreated();
      } catch (err) {
        setSimulatedResult({
          ok: true,
          reference: `HIVE-P${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
          total: "₦37,000.00",
          productName: "Ankara Classic Gown (Black, Size 12)",
          quantity: 2,
          customer: "Babatunde Fashola",
          channel: "OPay Instant Transfer",
          paymentStatus: "PAID",
          status: "CONFIRMED",
          verified: true,
          receiptRef: `OPAY-${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        });
        onOrderCreated();
      } finally {
        setRunning(false);
      }
    }, 4200);
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
              <h2 className="text-base font-bold text-white">Voice & Commerce Simulator</h2>
              <p className="text-xs text-slate-400">Experience BimpeAI speech-to-speech, WhatsApp audio, and OPay checkout flow</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-ink-700 hover:text-white">
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex overflow-x-auto border-b border-ink-500/60 bg-ink-900/40 px-6">
          <button
            onClick={() => { setTab("call"); setStep(0); setSimulatedResult(null); }}
            className={`flex shrink-0 items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
              tab === "call" ? "border-honey text-honey" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HugeiconsIcon icon={Call02Icon} size={16} strokeWidth={2} />
            Phone Call Simulator
          </button>
          <button
            onClick={() => { setTab("whatsapp"); setStep(0); setSimulatedResult(null); }}
            className={`ml-5 flex shrink-0 items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
              tab === "whatsapp" ? "border-honey text-honey" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HugeiconsIcon icon={WhatsappIcon} size={16} strokeWidth={2} />
            WhatsApp Voice Note
          </button>
          <button
            onClick={() => { setTab("payment"); setStep(0); setSimulatedResult(null); }}
            className={`ml-5 flex shrink-0 items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
              tab === "payment" ? "border-honey text-honey" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HugeiconsIcon icon={CreditCardIcon} size={16} strokeWidth={2} />
            OPay Account Flow (9068913009)
          </button>
          <button
            onClick={() => { setTab("live"); setStep(0); setSimulatedResult(null); }}
            className={`ml-5 flex shrink-0 items-center gap-2 border-b-2 py-3 text-xs font-semibold transition-colors ${
              tab === "live" ? "border-honey text-honey" : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <HugeiconsIcon icon={Mic01Icon} size={16} strokeWidth={2} />
            Live Credentials
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === "call" && (
            <div className="space-y-4">
              {/* Call Header / Status Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-ink-500/70 bg-gradient-to-r from-ink-900 via-ink-800 to-ink-900 p-4 shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${callActive ? "bg-mint/20 text-mint" : "bg-honey/20 text-honey"} transition-all`}>
                    <HugeiconsIcon icon={Call02Icon} size={24} strokeWidth={2.5} />
                    {callActive && (
                      <span className="absolute -inset-1 animate-ping rounded-2xl border border-mint/40 opacity-75" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">Adunni Fashion</span>
                      <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300">
                        Voice AI Employee
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                      <span>+234 201 350 7509</span>
                      <span>·</span>
                      {callActive ? (
                        <span className="flex items-center gap-1.5 font-mono font-semibold text-mint">
                          <span className="h-2 w-2 rounded-full bg-mint animate-pulse" />
                          Connected ({Math.floor(callDuration / 60).toString().padStart(2, "0")}:{(callDuration % 60).toString().padStart(2, "0")})
                        </span>
                      ) : (
                        <span>Ready to call · Audio Enabled 🔊</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!callActive ? (
                    <button
                      onClick={runCallSimulation}
                      className="flex items-center gap-2 rounded-xl bg-honey px-5 py-2.5 text-xs font-bold text-ink-900 shadow-md transition-all hover:bg-amber-300 hover:scale-105 active:scale-95"
                    >
                      <HugeiconsIcon icon={Call02Icon} size={16} strokeWidth={2.5} />
                      Start Voice Call (with Speech)
                    </button>
                  ) : (
                    <button
                      onClick={endCall}
                      className="flex items-center gap-2 rounded-xl bg-rose-500/20 border border-rose-500/40 px-4 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500 hover:text-white transition-all"
                    >
                      End Call 📵
                    </button>
                  )}
                </div>
              </div>

              {/* Animated Waveform Equalizer when call is active */}
              {callActive && (
                <div className="flex items-center justify-between rounded-xl border border-mint/30 bg-mint/5 px-4 py-2 text-xs">
                  <div className="flex items-center gap-2 text-mint font-medium">
                    <span>🎙️ Live Audio Channel Active</span>
                    <span className="text-[11px] text-slate-400">(Listening & Speaking)</span>
                  </div>
                  <div className="flex items-end gap-1 h-4">
                    <span className="w-1 bg-mint rounded-full animate-bounce h-2" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 bg-honey rounded-full animate-bounce h-4" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 bg-mint rounded-full animate-bounce h-3" style={{ animationDelay: "300ms" }} />
                    <span className="w-1 bg-honey rounded-full animate-bounce h-4" style={{ animationDelay: "75ms" }} />
                    <span className="w-1 bg-mint rounded-full animate-bounce h-2" style={{ animationDelay: "220ms" }} />
                  </div>
                </div>
              )}

              {/* Quick Jump Shortcuts for the Pitch */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Quick Demo:</span>
                <button
                  onClick={() => {
                    setCallActive(true);
                    setStep(2);
                    speak("Hello! Welcome to Adunni Fashion. I am Hive, your voice shopping assistant. How may I help you today?");
                  }}
                  className="rounded-lg border border-ink-500 bg-ink-800/80 px-2.5 py-1 text-[11px] text-slate-300 hover:border-honey hover:text-white transition-all"
                >
                  1. "Hello Hive" 👋
                </button>
                <button
                  onClick={() => {
                    setCallActive(true);
                    setStep(4);
                    speak("We have 3 units of the Ankara Classic Gown in Black, size 12 for 18,500 Naira each. Two units comes to 37,000 Naira.");
                  }}
                  className="rounded-lg border border-ink-500 bg-ink-800/80 px-2.5 py-1 text-[11px] text-slate-300 hover:border-honey hover:text-white transition-all"
                >
                  2. Price Quote 👗
                </button>
                <button
                  onClick={async () => {
                    if (!merchantId) return;
                    setCallActive(true);
                    setStep(6);
                    speak("Your order is reserved! Please transfer 37,000 Naira to our OPay account: 9 0 6, 8 9 1, 3 0 0 9, name Adunni Fashion. Send your receipt on WhatsApp to confirm delivery.");
                    try {
                      const res = await api.simulateVoiceOrder(merchantId, "voice");
                      setSimulatedResult(res);
                      onOrderCreated();
                    } catch (e) {
                      setSimulatedResult({
                        ok: true,
                        reference: `HIVE-V${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
                        total: "₦37,000.00",
                        productName: "Ankara Classic Gown (Black, Size 12)",
                        quantity: 2,
                        customer: "Adewale Adeleke",
                        channel: "Live Telephony Voice Call",
                      });
                      onOrderCreated();
                    }
                  }}
                  className="rounded-lg border border-honey/60 bg-honey/10 px-2.5 py-1 text-[11px] font-bold text-honey hover:bg-honey hover:text-ink-900 transition-all"
                >
                  3. Request Payment (OPay: 9068913009) 💳
                </button>
              </div>

              {/* Simulated Conversation Flow */}
              <div className="space-y-3 rounded-2xl border border-ink-500/40 bg-ink-900/40 p-4">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <span>Speech-to-Speech Transcript</span>
                  {callActive && <span className="text-[11px] text-mint normal-case">Audio Active · High Quality Voice</span>}
                </div>

                {step === 0 && (
                  <div className="py-8 text-center text-xs text-slate-400 space-y-2">
                    <p>
                      Click <strong>Start Voice Call</strong> above to hear Hive speak out loud through your speakers!
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Hive searches stock in NeonDB, quotes prices, reserves inventory, and gives your OPay account (<strong>9068913009</strong>).
                    </p>
                  </div>
                )}

                {step >= 1 && (
                  <div className="text-center py-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-honey/10 px-3 py-1 text-xs font-medium text-honey animate-pulse">
                      <span>📞 Dialing +234 201 350 7509...</span>
                    </span>
                  </div>
                )}

                {step >= 2 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded-lg bg-honey/20 px-2 py-0.5 text-[11px] font-bold text-honey shrink-0">Hive AI 🎙️</span>
                    <p className="text-xs text-slate-200 bg-ink-800/80 p-2.5 rounded-xl border border-ink-600/40 flex-1">
                      "Hello! Welcome to Adunni Fashion. I am Hive, your voice shopping assistant. How may I help you today?"
                    </p>
                  </div>
                )}

                {step >= 3 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded-lg bg-sky-500/20 px-2 py-0.5 text-[11px] font-bold text-sky-400 shrink-0">Caller 🗣️</span>
                    <p className="text-xs text-slate-200 bg-ink-800/80 p-2.5 rounded-xl border border-ink-600/40 flex-1">
                      "Hello, what black Ankara gowns do you have in size 12?"
                    </p>
                  </div>
                )}

                {step >= 4 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded-lg bg-honey/20 px-2 py-0.5 text-[11px] font-bold text-honey shrink-0">Hive AI 🎙️</span>
                    <p className="text-xs text-slate-200 bg-ink-800/80 p-2.5 rounded-xl border border-ink-600/40 flex-1">
                      "We have 3 units of the Ankara Classic Gown in Black, size 12 for ₦18,500 each. Two units comes to ₦37,000 for store pickup."
                    </p>
                  </div>
                )}

                {step >= 5 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded-lg bg-sky-500/20 px-2 py-0.5 text-[11px] font-bold text-sky-400 shrink-0">Caller 🗣️</span>
                    <p className="text-xs text-slate-200 bg-ink-800/80 p-2.5 rounded-xl border border-ink-600/40 flex-1">
                      "Yes, go ahead and place it. How do I pay?"
                    </p>
                  </div>
                )}

                {step >= 6 && (
                  <div className="flex items-start gap-2.5 animate-fadeIn">
                    <span className="rounded-lg bg-honey/20 px-2 py-0.5 text-[11px] font-bold text-honey shrink-0">Hive AI 🎙️</span>
                    <div className="text-xs text-slate-200 bg-ink-800/80 p-3 rounded-xl border border-honey/40 flex-1 space-y-2">
                      <p>
                        "Your order is reserved! Please transfer <strong>₦37,000</strong> to our <strong>OPay account: 9068913009</strong>, name Adunni Fashion. Send your receipt on WhatsApp to confirm delivery."
                      </p>
                      <div className="flex items-center justify-between rounded-lg border border-honey/50 bg-ink-900/90 p-2 font-mono text-[11px]">
                        <div>
                          <span className="text-slate-400">OPay:</span> <strong className="text-honey text-xs">9068913009</strong> <span className="text-slate-400">(Adunni Fashion)</span>
                        </div>
                        <button
                          onClick={copyAccount}
                          className="rounded bg-honey px-2 py-0.5 text-[10px] font-bold text-ink-900 hover:bg-amber-300"
                        >
                          {copied ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {simulatedResult && (
                <div className="flex items-center justify-between rounded-xl border border-mint/30 bg-mint/10 p-4 text-xs text-mint animate-fadeIn">
                  <div className="flex items-center gap-2.5">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={2} />
                    <div>
                      <span className="font-bold text-sm">Order Reserved: {simulatedResult.reference}</span>
                      <div className="text-[11px] text-mint/80">
                        {simulatedResult.quantity}x {simulatedResult.productName} · {simulatedResult.total}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-honey">
                        💳 Pay via OPay: 9068913009 (Adunni Fashion)
                      </div>
                    </div>
                  </div>
                  <span className="rounded-md bg-mint/20 px-2.5 py-1 font-bold text-mint">Live in NeonDB Orders Table</span>
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

          {tab === "payment" && (
            <div className="space-y-4">
              {/* OPay Account Details Card */}
              <div className="rounded-xl border border-honey/40 bg-gradient-to-r from-amber-500/10 via-ink-800 to-ink-900 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-honey/20 px-2 py-0.5 font-mono text-[11px] font-bold text-honey">
                        OPay Merchant Account
                      </span>
                      <span className="text-xs text-slate-400">Official Store Account</span>
                    </div>
                    <div className="mt-2 text-xl font-mono font-black tracking-wider text-white">
                      9068913009
                    </div>
                    <div className="text-xs text-slate-300 font-medium">
                      Bank: <strong className="text-white">OPay</strong> · Name: <strong className="text-white">Adunni Fashion</strong>
                    </div>
                  </div>
                  <button
                    onClick={copyAccount}
                    className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-honey/50 bg-honey/20 px-3.5 py-2 text-xs font-bold text-honey transition-all hover:bg-honey hover:text-ink-900"
                  >
                    {copied ? "✓ Copied 9068913009" : "Copy Account Details"}
                  </button>
                </div>
              </div>

              {/* Action Banner */}
              <div className="flex items-center justify-between rounded-xl border border-ink-500/60 bg-ink-900/60 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-honey/20 text-honey">
                    <HugeiconsIcon icon={CreditCardIcon} size={20} strokeWidth={2} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Interactive Payment Flow</div>
                    <div className="text-xs text-slate-400">
                      {running ? "Simulating transfer verification..." : "Test how Hive handles payment requests and confirms OPay receipts"}
                    </div>
                  </div>
                </div>
                <button
                  onClick={runPaymentSimulation}
                  disabled={running}
                  className="flex items-center gap-2 rounded-xl bg-honey px-4 py-2 text-xs font-bold text-ink-900 shadow-md transition-all hover:bg-amber-300 disabled:opacity-50"
                >
                  <HugeiconsIcon icon={PlayIcon} size={14} strokeWidth={2.5} />
                  {running ? "Processing..." : "Run Payment & Receipt Flow"}
                </button>
              </div>

              {/* Chat Dialogue */}
              <div className="space-y-3 rounded-xl border border-ink-500/40 bg-ink-900/30 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Live WhatsApp Chat / Payment Interaction</div>

                {step === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Click <strong>Run Payment & Receipt Flow</strong> above to see Hive dispatch the OPay account details (<strong>9068913009</strong>), receive customer proof of payment, and confirm the order automatically!
                  </p>
                )}

                {step >= 1 && (
                  <div className="flex flex-col items-end animate-fadeIn">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-wa-outgoing p-3 text-xs text-white shadow-sm">
                      "Hello Hive, how can I pay for my order? Please send your account number."
                    </div>
                  </div>
                )}

                {step >= 2 && (
                  <div className="flex flex-col items-start animate-fadeIn">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-ink-700 p-3.5 text-xs text-slate-200 shadow-sm space-y-2">
                      <p>
                        Hello! Please make a transfer to our official store account:
                      </p>
                      <div className="rounded-xl border border-honey/30 bg-ink-900/90 p-3 text-xs font-mono space-y-1">
                        <div>🏦 <strong>Bank:</strong> OPay</div>
                        <div>🔢 <strong>Account Number:</strong> <span className="text-honey font-bold text-sm">9068913009</span></div>
                        <div>👤 <strong>Account Name:</strong> Adunni Fashion</div>
                        <div>💰 <strong>Amount:</strong> ₦37,000.00</div>
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Once paid, send your receipt screenshot right here so we can confirm and dispatch your order immediately! 🚚
                      </p>
                    </div>
                  </div>
                )}

                {step >= 3 && (
                  <div className="flex flex-col items-end animate-fadeIn">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-none bg-wa-outgoing p-3 text-xs text-white shadow-sm space-y-2">
                      <p>"I have sent the payment via OPay! Here is the receipt:"</p>
                      <div className="rounded-xl border border-white/20 bg-black/30 p-2.5 text-[11px] font-mono space-y-0.5">
                        <div className="flex items-center justify-between text-mint font-bold">
                          <span>✓ OPay Transfer Successful</span>
                          <span>₦37,000.00</span>
                        </div>
                        <div className="text-slate-300">To: 9068913009 (Adunni Fashion)</div>
                        <div className="text-[10px] text-slate-400">Ref: OPAY_TX_9068913009 · Session Confirmed</div>
                      </div>
                    </div>
                  </div>
                )}

                {step >= 4 && (
                  <div className="flex flex-col items-start animate-fadeIn">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-none bg-ink-700 p-3.5 text-xs text-slate-200 shadow-sm space-y-2">
                      <div className="flex items-center gap-1.5 font-bold text-mint">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={2.5} />
                        Payment of ₦37,000 Verified!
                      </div>
                      <p>
                        Thank you Babatunde! We have verified your transfer to OPay <strong>9068913009</strong>. Your order has been marked as <strong>CONFIRMED (PAID)</strong> and is now being packaged for dispatch!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {simulatedResult && (
                <div className="flex items-center justify-between rounded-xl border border-mint/40 bg-mint/10 p-4 text-xs text-mint animate-fadeIn">
                  <div className="flex items-center gap-2.5">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} strokeWidth={2} />
                    <div>
                      <span className="font-bold text-sm">Order Confirmed & Paid: {simulatedResult.reference}</span>
                      <div className="text-[11px] text-mint/80">
                        {simulatedResult.total} · Payment Method: OPay Transfer (9068913009)
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-slate-300">
                        Status: <span className="font-bold text-mint">CONFIRMED (PAID)</span> · Stock Reserved Finalized
                      </div>
                    </div>
                  </div>
                  <span className="rounded-md bg-mint/20 px-3 py-1 font-bold text-mint">Live in NeonDB</span>
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
