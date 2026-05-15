"use client";
import { useState, useEffect, useRef, useCallback } from "react";

type CodeResult = {
  found: boolean; valid?: boolean; redeemed?: boolean; expired?: boolean;
  dayInvalid?: boolean; validDaysText?: string; nextValidDate?: string;
  customerName?: string; customerPhone?: string; prizeName?: string; prizeHow?: string;
  expiresAt?: string; redeemedAt?: string; code?: string;
};
type RecentEntry = { code: string; customer_name: string; prize_name: string; redeemed_at: string; };
type Session = { role: string; userName: string; userId: string | null; };
type SuccessInfo = { customerName: string; prizeName: string; };

export default function AcessoPage() {
  const [session, setSession]     = useState<Session | null>(null);
  const [loading, setLoading]     = useState(true);
  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [loginErr, setLoginErr]   = useState("");
  const [logging, setLogging]     = useState(false);

  const [codeInput, setCodeInput]   = useState("");
  const [result, setResult]         = useState<CodeResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [successInfo, setSuccessInfo] = useState<SuccessInfo | null>(null);
  const [recent, setRecent]         = useState<RecentEntry[]>([]);

  // QR Scanner
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerErr, setScannerErr]   = useState("");
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const scanningRef = useRef(false);
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

  async function validate(code?: string) {
    const c = (code || codeInput).trim().toUpperCase();
    if (!c) return;
    setValidating(true); setResult(null); setSuccessInfo(null);
    const res = await fetch(`/api/codes/validate?code=${c}`);
    const d   = await res.json();
    setResult(d); setValidating(false);
    if (code) setCodeInput(c);
  }

  async function redeem() {
    if (!result) return;
    setConfirming(true);
    const res = await fetch("/api/codes/redeem", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeInput.trim().toUpperCase() }),
    });
    const d = await res.json();
    setConfirming(false);

    if (res.ok) {
      setSuccessInfo({ customerName: d.customerName || result.customerName || "Cliente", prizeName: d.prizeName || result.prizeName || "Prêmio" });
      setResult(null); setCodeInput("");
      loadRecent(session?.userId);
      setTimeout(() => setSuccessInfo(null), 4000);
    } else {
      setResult(r => r ? { ...r, redeemed: true, valid: false } : r);
    }
  }

  // ── QR Scanner ────────────────────────────────────────────────────
  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScannerOpen(false);
    setScannerErr("");
  }, []);

  async function startScanner() {
    setScannerErr(""); setScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      scanningRef.current = true;
      scanFrame();
    } catch (e) {
      setScannerErr("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
      setScannerOpen(false);
    }
  }

  function scanFrame() {
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

    // Use BarcodeDetector if available (modern browsers)
    if ("BarcodeDetector" in window) {
      const detector = new (window as unknown as { BarcodeDetector: new (opts: unknown) => { detect: (img: unknown) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ["qr_code"] });
      detector.detect(canvas).then((barcodes: Array<{ rawValue: string }>) => {
        if (barcodes.length > 0) {
          const raw = barcodes[0].rawValue;
          // Extract BTQ code from URL or use raw value
          const match = raw.match(/BTQ-[A-Z0-9]{5}/);
          const code  = match ? match[0] : raw.toUpperCase();
          if (code.startsWith("BTQ-") && code.length === 9) {
            stopScanner();
            validate(code);
            return;
          }
        }
        if (scanningRef.current) animFrameRef.current = requestAnimationFrame(scanFrame);
      }).catch(() => {
        if (scanningRef.current) animFrameRef.current = requestAnimationFrame(scanFrame);
      });
    } else {
      // Fallback: scan every 500ms without BarcodeDetector
      setTimeout(() => { if (scanningRef.current) animFrameRef.current = requestAnimationFrame(scanFrame); }, 500);
    }
  }

  useEffect(() => () => stopScanner(), [stopScanner]);

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
        <p className="text-xs text-amber-500 mt-0.5">Resgatado em {result.redeemedAt ? new Date(result.redeemedAt).toLocaleString("pt-BR") : "—"}</p>
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
        <p className="font-semibold text-orange-700">📅 Dia de resgate inválido</p>
        <p className="text-sm text-orange-600 mt-1">Prêmio: <strong>{result.prizeName}</strong></p>
        <p className="text-sm text-orange-600 mt-1">Dias permitidos: <strong>{result.validDaysText}</strong></p>
        {result.nextValidDate && <p className="text-xs text-orange-500 mt-1">Próximo dia disponível: {result.nextValidDate}</p>}
      </div>
    );
    const remH = result.expiresAt ? Math.ceil((new Date(result.expiresAt).getTime() - Date.now()) / 3600000) : 0;
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
        <p className="font-semibold text-emerald-700 text-lg mb-3">✓ Código válido!</p>
        <div className="space-y-1 text-sm text-emerald-700 mb-4">
          <p>Cliente: <strong>{result.customerName}</strong></p>
          <p>Telefone: {result.customerPhone || "—"}</p>
          <p>Prêmio: <strong>{result.prizeName}</strong></p>
          {result.prizeHow && <p className="text-xs text-emerald-600 mt-1">{result.prizeHow}</p>}
          <p className="text-xs text-emerald-500">Expira em {remH}h · {result.expiresAt ? new Date(result.expiresAt).toLocaleString("pt-BR") : ""}</p>
        </div>
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
              <video ref={videoRef} className="w-full rounded-xl" playsInline muted />
              <canvas ref={canvasRef} className="hidden" />
              {/* Crosshair overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-56 h-56 border-4 border-orange-400 rounded-2xl opacity-80">
                  <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-orange-400 rounded-tl-xl" />
                  <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-orange-400 rounded-tr-xl" />
                  <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-orange-400 rounded-bl-xl" />
                  <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-orange-400 rounded-br-xl" />
                </div>
              </div>
              <p className="absolute bottom-4 left-0 right-0 text-center text-white text-sm opacity-80">
                Aponte a câmera para o QR Code do cliente
              </p>
            </div>
            {scannerErr && <p className="text-red-400 text-sm mt-4 px-6 text-center">{scannerErr}</p>}
            <button onClick={stopScanner} className="mt-6 px-8 py-3 bg-zinc-800 text-white rounded-xl text-sm">
              Cancelar
            </button>
          </div>
        )}

        {/* Code input */}
        <div className="card mb-4">
          <label className="label">Código do prêmio</label>
          <div className="flex gap-2 mb-2">
            <input
              className="input font-mono tracking-widest text-lg uppercase flex-1"
              maxLength={9}
              placeholder="BTQ-XXXXX"
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value.toUpperCase()); setResult(null); setSuccessInfo(null); }}
              onKeyDown={e => e.key === "Enter" && validate()}
            />
            <button className="btn-secondary px-4" onClick={() => validate()} disabled={validating}>
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
