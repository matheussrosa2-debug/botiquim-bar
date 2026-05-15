"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { maskCPF, maskPhone, validCPF, cpfDigits } from "@/lib/utils";

function clean(s: string): string {
  return s.replace(/[^\x00-\xFF]/g, " ").replace(/\s+/g, " ").trim();
}

function encodePayload(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)));
}

type Prize = { id:string; name:string; short:string; how:string; sub:string; color:string; weight:number; validity_hours:number; validity_type:string; enabled:boolean; image_url?: string; valid_days?: number[]|null; };
type Event = { id:string; name:string; description:string; active:boolean; };
type Step  = "cpf" | "form" | "wheel" | "prize";

export default function Home() {
  const [step, setStep]             = useState<Step>("cpf");
  const [prizes, setPrizes]         = useState<Prize[]>([]);
  const [prizesLoading, setPrizesLoading] = useState(true);
  const [barName, setBarName]       = useState("Botiquim Bar");
  const [barHandle, setBarHandle]   = useState("@botiquim.bar");
  const [activeEvent, setActiveEvent] = useState<Event | null>(null);

  const [cpfVal, setCpfVal]         = useState("");
  const [cpfErr, setCpfErr]         = useState("");
  const [cpfLoading, setCpfLoading] = useState(false);

  const [form, setForm]             = useState({ name:"", phone:"", email:"", birth:"", instagram:"" });
  const [formErr, setFormErr]       = useState<Record<string, string>>({});
  const [formLoading, setFormLoading] = useState(false);
  const [cpfClean, setCpfClean]     = useState("");
  const [cpfFmt, setCpfFmt]         = useState("");
  const [lgpdConsent, setLgpdConsent]           = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(true);

  const [wonPrize, setWonPrize]     = useState<Prize | null>(null);
  const [wonCode, setWonCode]       = useState("");
  const [wonExpiry, setWonExpiry]   = useState("");
  const [spinLoading, setSpinLoading] = useState(false);
  const [firstName, setFirstName]   = useState("");
  const [netErr, setNetErr]         = useState("");
  const [spinLabel, setSpinLabel]   = useState("Girar a roleta!");
  const [spinDisabled, setSpinDisabled] = useState(false);

  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const wheelAngle = useRef(0);
  const spinning   = useRef(false);

  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("event");
    if (slug) {
      fetch(`/api/events/${slug}`).then(r => r.json())
        .then(d => { if (d.event) setActiveEvent(d.event); }).catch(() => {});
    }
    setPrizesLoading(true);
    fetch("/api/prizes").then(r => r.json())
      .then(d => { setPrizes((d.prizes || []).filter((p: Prize) => p.enabled)); setPrizesLoading(false); })
      .catch(() => setPrizesLoading(false));
    fetch("/api/config").then(r => r.json()).then(d => {
      if (d.bar_name)   setBarName(d.bar_name);
      if (d.bar_handle) setBarHandle(d.bar_handle);
    }).catch(() => {});
  }, []);

  const drawWheel = useCallback((angle: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !prizes.length) return;
    const ctx = canvas.getContext("2d")!;
    const N = prizes.length, arc = (2 * Math.PI) / N, cx = 150, cy = 150, r = 147;
    ctx.clearRect(0, 0, 300, 300);
    for (let i = 0; i < N; i++) {
      const s = angle + i * arc, e = s + arc;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, s, e); ctx.closePath();
      ctx.fillStyle = prizes[i].color; ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(s + arc / 2);
      ctx.fillStyle = "#fff"; ctx.font = "600 10px Inter,sans-serif"; ctx.textAlign = "right";
      const lines = (prizes[i].short || prizes[i].name.slice(0, 12)).split("\\n");
      const lh = 13, y0 = -(lines.length - 1) * lh / 2 + 4;
      lines.forEach((ln, li) => ctx.fillText(ln, r - 10, y0 + li * lh, r - 28));
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.fillStyle = "#999"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("★", cx, cy + 5);
  }, [prizes]);

  useEffect(() => { drawWheel(wheelAngle.current); }, [drawWheel]);

  function animateToIndex(targetIndex: number, onDone: () => void) {
    const N = prizes.length, arc = (2 * Math.PI) / N;
    let R = 1.5 * Math.PI - (targetIndex * arc + arc / 2) - (wheelAngle.current % (2 * Math.PI));
    if (R < 0) R += 2 * Math.PI;
    R += (5 + Math.floor(Math.random() * 4)) * 2 * Math.PI;
    const start = wheelAngle.current, dur = 4800, t0 = performance.now();
    function tick(now: number) {
      const el = Math.min(now - t0, dur), prog = el / dur, eased = 1 - Math.pow(1 - prog, 4);
      wheelAngle.current = start + R * eased;
      drawWheel(wheelAngle.current);
      if (prog < 1) requestAnimationFrame(tick);
      else { spinning.current = false; setTimeout(onDone, 600); }
    }
    requestAnimationFrame(tick);
  }

  async function handleCPF() {
    setCpfErr("");
    if (!validCPF(cpfVal)) { setCpfErr("CPF inválido. Verifique os dígitos."); return; }
    setCpfLoading(true);
    try {
      const c = cpfDigits(cpfVal);
      const res = await fetch(`/api/customers/check?cpf=${c}`);
      const data = await res.json();
      setCpfLoading(false);
      if (data.exists) { setCpfErr("Este CPF já está cadastrado no sistema."); return; }
      setCpfClean(c); setCpfFmt(cpfVal); setStep("form");
    } catch { setCpfErr("Erro de conexão. Tente novamente."); setCpfLoading(false); }
  }

  async function handleForm() {
    const errs: Record<string, string> = {};
    if (form.name.trim().split(/\s+/).filter(Boolean).length < 2) errs.name = "Informe nome e sobrenome";
    if (form.phone.replace(/\D/g, "").length < 10) errs.phone = "Telefone inválido";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "E-mail inválido";
    if (!form.birth) { errs.birth = "Data obrigatória"; }
    else {
      const bd = new Date(form.birth + "T12:00:00"), td = new Date();
      let age = td.getFullYear() - bd.getFullYear();
      if (td.getMonth() < bd.getMonth() || (td.getMonth() === bd.getMonth() && td.getDate() < bd.getDate())) age--;
      if (age < 18) errs.birth = "É necessário ter 18 anos ou mais";
    }
    if (!lgpdConsent) errs.lgpd = "Você precisa aceitar a política de privacidade para continuar";
    if (Object.keys(errs).length) { setFormErr(errs); return; }

    setFormLoading(true); setNetErr("");
    try {
      const cleanName  = clean(form.name);
      const cleanPhone = clean(form.phone);
      const cleanEmail = clean(form.email);
      const rawIg      = clean(form.instagram);
      const ig         = rawIg ? (rawIg.startsWith("@") ? rawIg : "@" + rawIg) : "";

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: encodePayload({
          name: cleanName, phone: cleanPhone, email: cleanEmail,
          birth: form.birth, instagram: ig,
          cpf: cpfClean, cpf_fmt: cpfFmt,
          event_id:   activeEvent?.id   || null,
          event_name: activeEvent ? clean(activeEvent.name) : null,
          lgpd_consent: true, marketing_consent: marketingConsent,
        }),
      });

      setFormLoading(false);
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "Erro desconhecido" }));
        setFormErr({ submit: d.error || "Erro ao cadastrar." });
        return;
      }
      setFirstName(cleanName.split(" ")[0]);
      setStep("wheel");
    } catch { setNetErr("Erro de conexão. Tente novamente."); setFormLoading(false); }
  }

  async function handleSpin() {
    if (spinning.current || spinLoading || !prizes.length) return;
    setSpinLoading(true); setSpinDisabled(true); setSpinLabel("Sorteando..."); setNetErr("");
    try {
      const res = await fetch("/api/codes/spin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cpfClean }),
      });
      if (!res.ok) {
        const d = await res.json();
        setNetErr(d.error || "Erro ao sortear.");
        setSpinDisabled(false); setSpinLabel("Tentar novamente"); setSpinLoading(false); return;
      }
      const data = await res.json();
      setWonPrize(data.prize); setWonCode(data.code);
      setWonExpiry(data.expires_at ? new Date(data.expires_at).toLocaleString("pt-BR") : "");
      spinning.current = true; setSpinLabel("Girando..."); setSpinLoading(false);
      // Find the index in the CLIENT prizes array by ID — guarantees animation matches prize
      const clientIndex = prizes.findIndex(p => p.id === data.prize.id);
      const safeIndex   = clientIndex >= 0 ? clientIndex : 0;
      animateToIndex(safeIndex, () => setStep("prize"));
    } catch {
      setNetErr("Erro de conexão. Tente novamente.");
      setSpinDisabled(false); setSpinLabel("Tentar novamente"); setSpinLoading(false);
    }
  }

  function setF(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); setFormErr(e => ({ ...e, [k]: "" })); }

  return (
    <main className="min-h-screen flex flex-col items-center justify-start pt-8 pb-16 px-4">
      <div className="w-full max-w-md">

        {step !== "wheel" && (
          <div className="text-center mb-7">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://mzewaanljgofkcqetsgo.supabase.co/storage/v1/object/public/assets/Logo%20Em%20Alta%20Botiquim.png"
              alt="Botiquim Bar · Restaurante"
              className="w-36 h-36 object-contain mx-auto mb-2 drop-shadow-md"
            />
            <p className="text-xs tracking-[3px] uppercase mb-0.5" style={{color:"#C9A84C", fontFamily:"Lato, sans-serif", fontWeight:700}}>bem-vindo ao</p>
            <h1 className="text-3xl font-display font-bold" style={{color:"#1A1A1A"}}>{barName}</h1>
            <p className="text-sm mt-1" style={{color:"#C9A84C"}}>{barHandle}</p>
          </div>
        )}

        {activeEvent && (step === "cpf" || step === "form") && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 mb-4">
            <span className="text-xl flex-shrink-0">🎉</span>
            <div>
              <p className="font-semibold text-amber-900 text-sm">{activeEvent.name}</p>
              {activeEvent.description && <p className="text-xs text-amber-700 mt-0.5">{activeEvent.description}</p>}
            </div>
          </div>
        )}

        {netErr && <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">{netErr}</div>}

        {/* CPF step */}
        {step === "cpf" && (
          <div className="card">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-orange-50 border border-orange-100 mb-5">
              <span className="text-2xl">🎰</span>
              <div>
                <p className="font-semibold text-zinc-800">Cadastre-se e gire a roleta!</p>
                <p className="text-sm text-zinc-500 mt-0.5">Preencha seus dados e ganhe um prêmio na hora</p>
              </div>
            </div>
            <label className="label">Informe seu CPF para começar</label>
            <input className="input" placeholder="000.000.000-00" maxLength={14}
              value={cpfVal}
              onChange={e => { setCpfVal(maskCPF(e.target.value)); setCpfErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleCPF()} />
            {cpfErr && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-700 font-medium">{cpfErr}</p>
                {cpfErr.includes("já está cadastrado") && (
                  <p className="text-xs text-red-500 mt-1">Cada CPF pode ser cadastrado apenas uma vez.</p>
                )}
              </div>
            )}
            <button className="btn-primary mt-4" onClick={handleCPF} disabled={cpfLoading}>
              {cpfLoading ? "Verificando..." : "Continuar →"}
            </button>
          </div>
        )}

        {/* Form step */}
        {step === "form" && (
          <div className="card">
            <button onClick={() => setStep("cpf")} className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-600 mb-4">← Voltar</button>
            <h2 className="font-semibold text-zinc-900 mb-4">Seus dados</h2>
            <div className="mb-3">
              <label className="label">Nome completo *</label>
              <input className="input" placeholder="Nome e sobrenome" value={form.name} onChange={e => setF("name", e.target.value)} />
              <p className="field-err">{formErr.name}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="label">Telefone / WhatsApp *</label>
                <input className="input" placeholder="(11) 99999-9999" maxLength={15} value={form.phone} onChange={e => setF("phone", maskPhone(e.target.value))} />
                <p className="field-err">{formErr.phone}</p>
              </div>
              <div>
                <label className="label">Data de nascimento *</label>
                <input className="input" type="date" value={form.birth} onChange={e => setF("birth", e.target.value)} />
                <p className="field-err">{formErr.birth}</p>
              </div>
            </div>
            <div className="mb-3">
              <label className="label">CPF</label>
              <input className="input opacity-60" readOnly value={cpfFmt} />
            </div>
            <div className="mb-3">
              <label className="label">E-mail *</label>
              <input className="input" type="email" placeholder="seu@email.com" value={form.email} onChange={e => setF("email", e.target.value)} />
              <p className="field-err">{formErr.email}</p>
            </div>
            <div className="mb-5">
              <label className="label">Instagram (opcional)</label>
              <input className="input" placeholder="@seuperfil" value={form.instagram}
                onChange={e => { let v = e.target.value; if (v && v !== "@" && !v.startsWith("@")) v = "@" + v; setF("instagram", v); }} />
            </div>
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 mb-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 flex-shrink-0 accent-orange-500"
                  checked={lgpdConsent}
                  onChange={e => { setLgpdConsent(e.target.checked); setFormErr(x => ({ ...x, lgpd: "" })); }} />
                <span className="text-xs text-zinc-600 leading-relaxed">
                  Li e aceito a <a href="/privacidade" target="_blank" className="underline text-orange-600">Política de Privacidade</a> e autorizo o {barName} a armazenar meus dados para fins de cadastro. <span className="text-red-500">*</span>
                </span>
              </label>
              {formErr.lgpd && <p className="text-xs text-red-500">{formErr.lgpd}</p>}
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5 flex-shrink-0 accent-orange-500"
                  checked={marketingConsent} onChange={e => setMarketingConsent(e.target.checked)} />
                <span className="text-xs text-zinc-600 leading-relaxed">
                  Aceito receber promoções, avisos de eventos e mensagem de aniversário via WhatsApp.
                </span>
              </label>
            </div>
            {formErr.submit && <p className="text-sm text-red-500 mb-3">{formErr.submit}</p>}
            <button className="btn-primary" onClick={handleForm} disabled={formLoading || !lgpdConsent}>
              {formLoading ? "Cadastrando..." : "Cadastrar e girar a roleta →"}
            </button>
            {!lgpdConsent && <p className="text-xs text-zinc-400 text-center mt-2">Aceite a política de privacidade para continuar</p>}
            <p className="text-[11px] text-zinc-400 text-center mt-2">Dados usados exclusivamente pelo {barName}.</p>
          </div>
        )}

        {/* Wheel step */}
        {step === "wheel" && (
          <div className="text-center">
            <div className="mb-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://mzewaanljgofkcqetsgo.supabase.co/storage/v1/object/public/assets/Logo%20Em%20Alta%20Botiquim.png" alt="Botiquim" className="w-20 h-20 object-contain mx-auto mb-2 drop-shadow-md"/>
              <h1 className="text-2xl font-bold" style={{fontFamily:"Playfair Display, serif"}}>{barName}</h1>
              <p className="text-zinc-500 mt-1">Boa sorte, <strong style={{color:"#C41E1E"}}>{firstName}</strong>! 🎰</p>
            </div>
            <div className="relative w-[300px] mx-auto mb-5">
              <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 z-10 w-0 h-0 border-l-[11px] border-r-[11px] border-t-[28px] border-l-transparent border-r-transparent border-t-zinc-900" />
              {prizesLoading ? (
                <div className="w-[300px] h-[300px] rounded-full bg-zinc-100 flex flex-col items-center justify-center gap-3">
                  <div className="animate-spin w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full" />
                  <p className="text-sm text-zinc-400">Preparando a roleta...</p>
                </div>
              ) : (
                <canvas ref={canvasRef} width={300} height={300} className="block rounded-full shadow-lg" />
              )}
            </div>
            {netErr && <p className="text-sm text-red-500 mb-3">{netErr}</p>}
            <button className="btn-primary max-w-[300px]" onClick={handleSpin} disabled={spinDisabled || prizesLoading}>
              {spinLoading
                ? <span className="flex items-center justify-center gap-2"><span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> Sorteando...</span>
                : prizesLoading ? "Carregando..." : spinLabel}
            </button>
          </div>
        )}

        {/* Prize step */}
        {step === "prize" && wonPrize && (
          <div className="card text-center">
            <div className="text-5xl mb-3">🎉</div>
            <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{color:"#C9A84C"}}>você ganhou</p>
            <h2 className="text-2xl font-bold my-2" style={{fontFamily:"Playfair Display, serif", color:"#1A1A1A"}}>{wonPrize.name}</h2>
            {wonPrize.sub && <p className="text-sm text-zinc-400 mb-4">{wonPrize.sub}</p>}

            {/* Prize image */}
            {wonPrize.image_url && (
              <div className="mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={wonPrize.image_url} alt={wonPrize.name}
                  className="w-48 h-48 object-cover rounded-2xl mx-auto shadow-md border border-zinc-100" />
              </div>
            )}

            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 text-left mb-4">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-2">Como resgatar</p>
              <p className="text-sm text-zinc-700 leading-relaxed">{wonPrize.how}</p>
            </div>

            {/* Valid days info */}
            {wonPrize.valid_days && wonPrize.valid_days.length > 0 ? (
              <div className="rounded-xl p-3 mb-4 text-left" style={{backgroundColor:"#FDF6E3",border:"1px solid #C9A84C33"}}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:"#A88830"}}>📅 Dias de resgate</p>
                <p className="text-sm font-semibold" style={{color:"#1A1A1A"}}>
                  {wonPrize.valid_days.slice().sort((a,b)=>a-b).map(d=>["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"][d]).join(", ")}
                </p>
                {(() => {
                  const today = new Date().getDay();
                  const isToday = wonPrize.valid_days.includes(today);
                  if (isToday) return <p className="text-xs mt-1" style={{color:"#2E7D32"}}>✅ Você pode resgatar hoje!</p>;
                  // Find next valid day
                  for (let i=1;i<=7;i++) {
                    const next = (today+i)%7;
                    if (wonPrize.valid_days.includes(next)) {
                      const d = new Date(); d.setDate(d.getDate()+i);
                      return <p className="text-xs mt-1" style={{color:"#C41E1E"}}>⏰ Próximo resgate: {d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"})}</p>;
                    }
                  }
                })()}
              </div>
            ) : (
              <div className="rounded-xl p-3 mb-4 text-left" style={{backgroundColor:"#F0FDF4",border:"1px solid #86EFAC"}}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{color:"#166534"}}>📅 Dias de resgate</p>
                <p className="text-sm" style={{color:"#166534"}}>✅ Válido todos os dias!</p>
              </div>
            )}
            <div className="border-2 border-dashed border-zinc-200 rounded-xl p-4 mb-2">
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-2">código do prêmio</p>
              <p className="text-3xl font-bold tracking-[.25em] font-mono text-zinc-900 mb-3">{wonCode}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/codes/qr?code=${wonCode}`} alt="QR Code do prêmio" className="w-28 h-28 mx-auto rounded-lg" />
            </div>
            <p className="text-xs text-zinc-400">Mostre o código ou QR ao atendente.<br />Expira em: {wonExpiry}</p>
          </div>
        )}

      </div>
    </main>
  );
}
