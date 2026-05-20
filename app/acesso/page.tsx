"use client";
import { useState, useEffect, useRef, useCallback } from "react";

type CodeResult = {
  found: boolean; valid?: boolean; redeemed?: boolean; expired?: boolean;
  dayInvalid?: boolean; validDaysText?: string; nextValidDate?: string;
  customerName?: string; customerPhone?: string; prizeName?: string; prizeHow?: string;
  expiresAt?: string; redeemedAt?: string; code?: string;
  redeemedByName?: string | null; redeemedByRole?: string | null;
  _redeemError?: string;
};
type RecentEntry = { code: string; customer_name: string; prize_name: string; redeemed_at: string; };
type Session = { role: string; userName: string; userId: string | null; };
type SuccessInfo = { customerName: string; prizeName: string; };

// ── jsQR loader via script tag (Safari compatible) ───────────────
let jsQRLib: ((data: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;
function loadJsQR(): Promise<typeof jsQRLib> {
  return new Promise((resolve) => {
    if (jsQRLib) { resolve(jsQRLib); return; }
    // Check if already loaded globally
    if (typeof (window as unknown as Record<string,unknown>).jsQR === "function") {
      jsQRLib = (window as unknown as Record<string,unknown>).jsQR as typeof jsQRLib;
      resolve(jsQRLib); return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js";
    script.onload = () => {
      jsQRLib = (window as unknown as Record<string,unknown>).jsQR as typeof jsQRLib;
      resolve(jsQRLib);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

// ── Code formatting helpers ───────────────────────────────────────
function formatCodeInput(raw: string): string {
  // Remove everything that isn't alphanumeric
  const clean = raw.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  // If user typed the full code with prefix, keep as-is
  if (clean.startsWith("BTQ") && clean.length > 3) {
    const rest = clean.slice(3).slice(0, 5);
    return rest.length > 0 ? `BTQ-${rest}` : "BTQ-";
  }
  // Otherwise treat as suffix only (max 5 chars)
  return clean.slice(0, 5);
}

function buildFullCode(input: string): string {
  const up = input.trim().toUpperCase();
  if (up.startsWith("BTQ-")) return up;
  if (up.startsWith("BTQ")) return `BTQ-${up.slice(3)}`;
  return `BTQ-${up}`;
}

export default function AcessoPage() {
  const [session, setSession]       = useState<Session | null>(null);
  const [loading, setLoading]       = useState(true);
  const [username, setUsername]     = useState("");
  const [password, setPassword]     = useState("");
  const [loginErr, setLoginErr]     = useState("");
  const [logging, setLogging]       = useState(false);

  const [codeInput, setCodeInput]   = useState("");
  const [result, setResult]         = useState<CodeResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [recent, setRecent]         = useState<RecentEntry[]>([]);

  // QR Scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerErr, setScannerErr]   = useState("");
  const [scannerStatus, setScannerStatus] = useState("Aponte para o QR Code do cliente");
  const videoRef     = useRef<HTMLVideoElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const streamRef    = useRef<MediaStream | null>(null);
  const scanningRef  = useRef(false);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.role) { setSession(d); loadRecent(d.userId); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function login() {
    setLoginErr(""); setLogging(true);
    const res = await fetch("/api/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const d = await res.json();
    setLogging(false);
    if (res.ok) { setSession({ role: d.role, userName: d.userName, userId: d.userId }); loadRecent(d.userId); }
    else { setLoginErr(d.error || "Usuário ou senha incorretos"); }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    setSession(null); setUsername(""); setPassword(""); setRecent([]);
  }

  async function loadRecent(userId?: string | null) {
    try {
      const url = userId ? `/api/codes/redeemed?period=today&user_id=${userId}` : "/api/codes/redeemed?period=today";
      const res = await fetch(url);
      const d   = await res.json();
      setRecent((d.codes || []).slice(0, 8));
    } catch {}
  }

  const codeInputRef = useRef<HTMLInputElement>(null);

  async function validate(code?: string) {
    // Read directly from DOM input as fallback — React state may lag on mobile
    const domValue = codeInputRef.current?.value?.trim().toUpperCase() || "";
    const raw  = code || codeInput || domValue;
    const full = buildFullCode(raw);
    if (!full || full === "BTQ-" || full.length < 9) return;
    setValidating(true); setResult(null); setSuccessInfo(null);
    try {
      const res = await fetch(`/api/codes/validate?code=${encodeURIComponent(full)}`);
      const d   = await res.json();
      setResult(d);
    } catch {
      setResult({ found: false });
    }
    setValidating(false);
    if (code) setCodeInput(full.replace("BTQ-", ""));
  }

  async function redeem() {
    if (!result) return;
    const full = buildFullCode(codeInput);
    setConfirming(true);
    const res = await fetch("/api/codes/redeem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: full }),
    });
    const d = await res.json();
    setConfirming(false);
    if (res.ok) {
      setSuccessInfo({ customerName: d.customerName || result.customerName || "Cliente", prizeName: d.prizeName || result.prizeName || "Prêmio" });
      setResult(null); setCodeInput("");
      loadRecent(session?.userId);
      setTimeout(() => setSuccessInfo(null), 4000);
    } else {
      // Show error message but don't mark as redeemed — let user try again
      const errMsg = d.error || "Erro ao confirmar resgate. Tente novamente.";
      setResult(r => r ? { ...r, _redeemError: errMsg } as CodeResult : r);
    }
  }

  // ── QR Scanner (jsQR — funciona no Safari/iPhone) ────────────────
  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScannerOpen(false);
    setScannerErr("");
    setScannerStatus("Aponte para o QR Code do cliente");
  }, []);

  function startScanner() {
    setScannerErr(""); setScannerOpen(true); setScannerStatus("Iniciando câmera...");

    // Must be synchronous start (no await before getUserMedia) for Safari iOS
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
    }).then(stream => {
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }

      video.srcObject = stream;

      video.onloadedmetadata = () => {
        const playPromise = video.play();
        if (playPromise) {
          playPromise.then(() => {
            setScannerStatus("Aponte para o QR Code do cliente");
            loadJsQR().then(() => {
              scanningRef.current = true;
              requestAnimationFrame(scanFrame);
            });
          }).catch(() => {
            // Safari sometimes rejects play() — try once more
            setTimeout(() => {
              video.play().catch(() => {});
              setScannerStatus("Aponte para o QR Code do cliente");
              loadJsQR().then(() => {
                scanningRef.current = true;
                requestAnimationFrame(scanFrame);
              });
            }, 500);
          });
        } else {
          setScannerStatus("Aponte para o QR Code do cliente");
          loadJsQR().then(() => {
            scanningRef.current = true;
            requestAnimationFrame(scanFrame);
          });
        }
      };
    }).catch(() => {
      setScannerErr("Câmera não disponível. No iPhone, acesse Ajustes → Safari → Câmera → Permitir.");
      setScannerOpen(false);
    });
  }

  async function scanFrame() {
    if (!scanningRef.current) return;
    const video  = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr        = jsQRLib ? jsQRLib(imageData.data, canvas.width, canvas.height) : null;

      if (qr?.data) {
        const raw   = qr.data;
        const match = raw.match(/BTQ-[A-Z0-9]{5}/);
        const code  = match ? match[0] : buildFullCode(raw);

        if (code.startsWith("BTQ-") && code.length === 9) {
          stopScanner();
          validate(code);
          return;
        }
      }
    } catch {}

    if (scanningRef.current) {
      // Scan at ~10fps to save battery on mobile
      setTimeout(() => {
        if (scanningRef.current) animFrameRef.current = requestAnimationFrame(scanFrame);
      }, 100);
    }
  }

  useEffect(() => () => stopScanner(), [stopScanner]);

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw       = e.target.value.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 5);
    setCodeInput(raw);
    setResult(null);
    setSuccessInfo(null);
  }

  function ResultBox() {
    if (!result) return null;
    if (!result.found) return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="font-semibold text-red-700">Código não encontrado</p>
        <p className="text-sm text-red-500 mt-1">Verifique os caracteres digitados.</p>
      </div>
    );
    if (result.redeemed) return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
        <p className="font-semibold text-amber-700">⚠ Código já utilizado</p>
        <p className="text-sm text-amber-600 mt-1">Prêmio: <strong>{result.prizeName}</strong></p>
        <p className="text-xs text-amber-500 mt-0.5">
          Resgatado em {result.redeemedAt ? new Date(result.redeemedAt).toLocaleString("pt-BR") : "—"}
        </p>
        {session?.role === "manager" && (
          <div className="mt-2 pt-2 border-t border-amber-200">
            <p className="text-xs font-semibold text-amber-700 mb-1">🔍 Informações de resgate</p>
            <p className="text-xs text-amber-600">
              Validado por: <strong>{result.redeemedByName || "—"}</strong>
              {result.redeemedByRole && (
                <span className="ml-1 text-amber-400">({result.redeemedByRole === "manager" ? "Gestor" : "Funcionário"})</span>
              )}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Data/hora: <strong>{result.redeemedAt ? new Date(result.redeemedAt).toLocaleString("pt-BR") : "—"}</strong>
            </p>
          </div>
        )}
      </div>
    );
    if (result.expired) return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-4">
        <p className="font-semibold text-red-700">Código expirado</p>
        <p className="text-sm text-red-500 mt-1">Expirou em {result.expiresAt ? new Date(result.expiresAt).toLocaleString("pt-BR") : "—"}</p>
      </div>
    );
    if (result.dayInvalid) return (
      <div className="rounded-xl bg-orange-50 border border-orange-200 p-4">
        <p className="font-semibold text-orange-700">📅 Ops! Hoje não é dia desse prêmio</p>
        <p className="text-sm text-orange-600 mt-1">Prêmio: <strong>{result.prizeName}</strong></p>
        <p className="text-sm text-orange-600 mt-1">Dias de resgate: <strong>{result.validDaysText}</strong></p>
        <p className="text-xs text-orange-500 mt-2">⚠️ Válido somente para consumo no local.</p>
      </div>
    );
    const remH = result.expiresAt ? Math.ceil((new Date(result.expiresAt).getTime() - Date.now()) / 3600000) : 0;
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
        <p className="font-semibold text-emerald-700 text-lg mb-3">✓ Código válido!</p>
        <div className="space-y-1 text-sm text-emerald-700 mb-3">
          <p>Cliente: <strong>{result.customerName}</strong></p>
          <p>Telefone: {result.customerPhone || "—"}</p>
          <p>Prêmio: <strong>{result.prizeName}</strong></p>
          <p className="text-xs text-emerald-500">Expira em {remH}h · {result.expiresAt ? new Date(result.expiresAt).toLocaleString("pt-BR") : ""}</p>
        </div>
        {result.validDaysText && result.validDaysText !== "Todos os dias" && (
          <div className="bg-emerald-100 rounded-xl p-3 mb-3 text-xs text-emerald-700">
            <p>📅 Resgate válido: <strong>{result.validDaysText}</strong></p>
            <p className="mt-0.5">⚠️ Válido somente para consumo no local.</p>
          </div>
        )}
        {(result as CodeResult & {_redeemError?:string})._redeemError && (
          <p className="text-sm text-red-600 mb-2">{(result as CodeResult & {_redeemError?:string})._redeemError}</p>
        )}
        <button className="btn-primary w-full" onClick={redeem} disabled={confirming}>
          {confirming ? "Confirmando..." : "✓ Confirmar resgate"}
        </button>
      </div>
    );
  }

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="text-zinc-400">Carregando...</p>
    </main>
  );

  if (!session) return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-zinc-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://mzewaanljgofkcqetsgo.supabase.co/storage/v1/object/public/assets/Logo%20Em%20Alta%20Botiquim.png"
            alt="Botiquim Bar"
            className="w-28 h-28 object-contain mx-auto mb-3 drop-shadow-md"
          />
          <h1 className="text-2xl font-bold" style={{fontFamily:"Playfair Display, serif", color:"#1A1A1A"}}>Portal da Equipe</h1>
          <p className="text-sm mt-1 font-semibold tracking-wider uppercase" style={{color:"#C9A84C", fontSize:"11px"}}>Botiquim Bar · Restaurante</p>
        </div>
        <div className="card">
          <div className="mb-4">
            <label className="label">Usuário</label>
            <input className="input" placeholder="seu.usuario" autoComplete="username"
              value={username} onChange={e => { setUsername(e.target.value); setLoginErr(""); }}
              onKeyDown={e => e.key === "Enter" && login()} />
          </div>
          <div className="mb-4">
            <label className="label">Senha</label>
            <input className="input" type="password" placeholder="••••••••" autoComplete="current-password"
              value={password} onChange={e => { setPassword(e.target.value); setLoginErr(""); }}
              onKeyDown={e => e.key === "Enter" && login()} />
          </div>
          {loginErr && <p className="text-sm text-red-500 mb-3">{loginErr}</p>}
          <button className="btn-primary" onClick={login} disabled={logging}>
            {logging ? "Verificando..." : "Entrar"}
          </button>
          <p className="text-xs text-zinc-400 text-center mt-4">Acesso restrito à equipe do Botiquim Bar</p>
        </div>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-8">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-zinc-400">Olá, <strong>{session.userName}</strong></p>
            <h1 className="text-xl font-semibold text-zinc-900">Validar código</h1>
          </div>
          <div className="flex gap-2">
            {session.role === "manager" && (
              <a href="/dashboard" className="btn-secondary text-sm">Dashboard</a>
            )}
            <button onClick={logout} className="btn-ghost text-sm">Sair</button>
          </div>
        </div>

        {/* Success animation */}
        {successInfo && (
          <div className="card mb-4 text-center border-2 border-emerald-300 bg-emerald-50">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-emerald-700 font-semibold text-lg">Resgate confirmado!</p>
            <p className="text-emerald-600 mt-1"><strong>{successInfo.customerName}</strong></p>
            <p className="text-emerald-500 text-sm mt-0.5">{successInfo.prizeName}</p>
          </div>
        )}

        {/* Scanner modal */}
        {scannerOpen && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
            <div className="relative w-full max-w-sm">
              <video ref={videoRef} className="w-full rounded-xl" playsInline muted autoPlay />
              <canvas ref={canvasRef} className="hidden" />
              {/* Crosshair overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-56">
                  <div className="absolute inset-0 border-2 border-white/20 rounded-2xl" />
                  <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-orange-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-orange-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-orange-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-orange-400 rounded-br-xl" />
                </div>
              </div>
            </div>
            <p className="text-white text-sm mt-4 opacity-80">{scannerStatus}</p>
            {scannerErr && <p className="text-red-400 text-sm mt-2 px-6 text-center">{scannerErr}</p>}
            <button onClick={stopScanner} className="mt-6 px-8 py-3 bg-zinc-800 text-white rounded-xl text-sm">
              Cancelar
            </button>
          </div>
        )}

        {/* Code input */}
        <div className="card mb-4">
          <label className="label">Código do prêmio</label>
          <div className="flex gap-2 mb-2">
            {/* Prefix label + input */}
            <div className="flex flex-1 items-center border rounded-xl overflow-hidden bg-white" style={{borderColor:"#E8E2D9"}}>
              <span className="px-3 py-3 text-sm font-mono font-bold text-zinc-400 bg-zinc-50 border-r select-none" style={{borderColor:"#E8E2D9"}}>
                BTQ-
              </span>
              <input
                className="flex-1 px-3 py-3 text-lg font-mono font-bold tracking-widest uppercase bg-white outline-none"
                maxLength={5}
                placeholder="XXXXX"
                ref={codeInputRef}
                value={codeInput}
                onChange={handleCodeChange}
                onKeyDown={e => e.key === "Enter" && validate()}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <button
              className="btn-secondary px-5 font-semibold"
              onClick={() => validate()}
              disabled={validating || codeInput.length < 5}
            >
              {validating ? "..." : "Validar"}
            </button>
          </div>

          {/* QR Scanner button */}
          <button
            onClick={startScanner}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-500 hover:border-orange-300 hover:text-orange-600 transition"
          >
            <span className="text-lg">📷</span>
            Escanear QR Code do cliente
          </button>

          {scannerErr && !scannerOpen && (
            <p className="text-sm text-red-500 mt-2">{scannerErr}</p>
          )}

          <div className="mt-3"><ResultBox /></div>
        </div>

        {/* Recent redemptions */}
        {recent.length > 0 && (
          <div className="card">
            <p className="text-xs text-zinc-400 uppercase tracking-wider mb-3">Suas validações de hoje</p>
            <div className="divide-y divide-zinc-100">
              {recent.map((r, i) => (
                <div key={i} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">{r.customer_name}</p>
                    <p className="text-xs text-zinc-400">
                      {r.prize_name} · {new Date(r.redeemed_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <p className="text-xs font-mono text-zinc-400">{r.code}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
