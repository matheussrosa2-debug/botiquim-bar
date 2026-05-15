"use client";
import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { slugify } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type Stats = { totalCustomers:number; totalCodes:number; redeemed:number; pending:number; expired:number; consentCount:number; todayRegistrations:number; registrationsByDay:{date:string;count:number}[]; prizeDistribution:{name:string;count:number;color:string}[]; birthday:{today:number;month:number}; whatsapp:{sent:number;failed:number}; };
type Prize = { id:string; name:string; short:string; how:string; sub:string; color:string; weight:number; validity_hours:number; validity_type:string; validity_until:string|null; enabled:boolean; limit_type:string; limit_every_n_registrations:number|null; limit_per_period_count:number|null; limit_per_period_type:string|null; limit_total_count:number|null; schedule_start_hour:number|null; schedule_end_hour:number|null; fallback_prize_id:string|null; issued_count:number; valid_days:number[]|null; image_url?:string; };
type Customer = { id:string; name:string; cpf:string; phone:string; email:string; birth_date:string; instagram:string; created_at:string; prize_code:string; prize_name:string; event_name:string; marketing_consent:boolean; deleted_at?:string; };
type Code = { id:string; code:string; customer_name:string; prize_name:string; created_at:string; expires_at:string; redeemed:boolean; redeemed_at:string; event_name:string; type:string; redeemed_by_name:string; };
type Event = { id:string; name:string; description:string; date:string; active:boolean; slug:string; qr_color:string; qr_bg_color:string; };
type BirthdayCustomer = { id:string; name:string; phone:string; email:string; bDay:number; bMonth:number; age:number; marketing_consent:boolean; birthday_sent_year:number|null; prize_code:string|null; };
type WaTemplate = { id:string; type:string; body:string; enabled:boolean; };
type WaMessage = { id:string; customer_name:string; phone:string; type:string; status:string; created_at:string; };
type SysUser = { id:string; name:string; username:string; role:string; active:boolean; last_seen:string|null; created_at:string; };
type AuditLogDetail = { name?: string; prize?: string; code?: string; count?: number; sent?: number; [key: string]: string | number | boolean | null | undefined };
type AuditLog = { id:string; action:string; entity:string; entity_id:string; user_name:string; user_role:string; ip:string; detail:AuditLogDetail; created_at:string; };
type RedeemedCode = { id:string; code:string; customer_name:string; prize_name:string; redeemed_at:string; redeemed_by_name:string; event_name:string; type:string; };
type AnalyticUser = { userId:string; name:string; role:string; total:number; byPrize:Record<string,number>; lastAt:string|null; };

const TABS = ["overview","clientes","resgates","codigos","premios","eventos","aniversariantes","analitico","usuarios","whatsapp","auditoria","config"] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab,string> = { overview:"Visão geral", clientes:"Clientes", resgates:"Resgates", codigos:"Códigos", premios:"Prêmios", eventos:"Eventos", aniversariantes:"Aniversariantes", analitico:"Analítico", usuarios:"Usuários", whatsapp:"WhatsApp", auditoria:"Auditoria", config:"Configurações" };

const PERIOD_OPTS = [["today","Hoje"],["7days","7 dias"],["month","Este mês"],["year","Este ano"]] as const;

export default function Dashboard() {
  const [authed, setAuthed]   = useState(false);
  const [loginRole, setLoginRole] = useState<string|null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passErr, setPassErr] = useState("");
  const [tab, setTab]         = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<Date|null>(null);
  const [sessionName, setSessionName] = useState("");

  // Data states
  const [stats, setStats]         = useState<Stats|null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custTotal, setCustTotal] = useState(0);
  const [custPage, setCustPage]   = useState(0);
  const [custQ, setCustQ]         = useState("");
  const [codes, setCodes]         = useState<Code[]>([]);
  const [codeFilter, setCodeFilter] = useState("all");
  const [prizes, setPrizes]       = useState<Prize[]>([]);
  const [events, setEvents]       = useState<Event[]>([]);
  const [birthdays, setBirthdays] = useState<BirthdayCustomer[]>([]);
  const [bPeriod, setBPeriod]     = useState("month");
  const [bMonth, setBMonth]       = useState("");
  const [waCfg, setWaCfg]         = useState({ instance_id:"", token:"", client_token:"", enabled:false });
  const [waTemplates, setWaTemplates] = useState<WaTemplate[]>([]);
  const [waLogs, setWaLogs]       = useState<WaMessage[]>([]);
  const [sysUsers, setSysUsers]   = useState<SysUser[]>([]);
  const [resgates, setResgates]   = useState<RedeemedCode[]>([]);
  const [resgatesPeriod, setResgatesPeriod] = useState("today");
  const [resgatesBreakdown, setResgatesBreakdown] = useState<{name:string;count:number}[]>([]);
  const [resgatesFrom, setResgatesFrom] = useState("");
  const [resgatesTo, setResgatesTo]     = useState("");
  const [analytics, setAnalytics]       = useState<AnalyticUser[]>([]);
  const [analyticPeriod, setAnalyticPeriod] = useState("month");
  const [selectedUser, setSelectedUser] = useState<AnalyticUser|null>(null);
  const [userHistory, setUserHistory]   = useState<RedeemedCode[]>([]);
  const [auditLogs, setAuditLogs]       = useState<AuditLog[]>([]);
  const [campaignMsg, setCampaignMsg]   = useState("");
  const [campaignSegment, setCampaignSegment] = useState("all");
  const [campaignEventId, setCampaignEventId] = useState("");
  const [campaignBirthMonth, setCampaignBirthMonth] = useState("");
  const [campaignResult, setCampaignResult] = useState<{sent:number;failed:number;total:number}|null>(null);
  const [campaignSending, setCampaignSending] = useState(false);

  // Customer edit/delete
  const [editCustomer, setEditCustomer]   = useState<Partial<Customer> | null>(null);
  const [customerErr, setCustomerErr]     = useState("");
  const [customerSaving, setCustomerSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Customer | null>(null);
  const [showInactive, setShowInactive]   = useState(false);
  const [inactives, setInactives]         = useState<Customer[]>([]);

  // Export filters
  const [expFrom, setExpFrom] = useState(""); const [expTo, setExpTo] = useState("");
  const [expBirthMonth, setExpBirthMonth] = useState(""); const [expPrize, setExpPrize] = useState("");
  const [expCodeStatus, setExpCodeStatus] = useState(""); const [expEvent, setExpEvent] = useState("");

  // Prize editor
  const [editPrize, setEditPrize] = useState<Partial<Prize>|null>(null);
  const [prizeErr, setPrizeErr]   = useState("");

  // Event editor
  const [editEvent, setEditEvent] = useState<Partial<Event>|null>(null);
  const [eventErr, setEventErr]   = useState("");

  // User editor
  const [editUser, setEditUser]   = useState<Partial<SysUser & {password:string}>|null>(null);
  const [userErr, setUserErr]     = useState("");

  // Config
  const [cfgBarName, setCfgBarName] = useState(""); const [cfgHandle, setCfgHandle] = useState("");
  const [cfgMsg, setCfgMsg]         = useState(""); const [cfgWaTest, setCfgWaTest] = useState("");
  const [cfgWaMsg, setCfgWaMsg]     = useState("");
  const [waMsg, setWaMsg]           = useState(""); const [waMsgErr, setWaMsgErr] = useState(false);
  const [waSaving, setWaSaving]     = useState(false);

  // Auth
  async function login() {
    setPassErr("");
    const res = await fetch("/api/auth", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ username, password }) });
    const d = await res.json();
    if (res.ok && d.role === "manager") { setAuthed(true); setSessionName(d.userName); loadAll(); }
    else if (res.ok && d.role !== "manager") { setPassErr("Este acesso é exclusivo para gestores."); }
    else { setPassErr(d.error || "Usuário ou senha incorretos"); }
  }
  async function logout() { await fetch("/api/auth", { method:"DELETE" }); setAuthed(false); setUsername(""); setPassword(""); }

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [sd, cd, od, pd, evd, cfd] = await Promise.all([
      fetch("/api/dashboard").then(r=>r.json()).catch(()=>({})),
      fetch("/api/customers?per_page=50&page=0").then(r=>r.json()).catch(()=>({customers:[],total:0})),
      fetch("/api/codes?limit=200").then(r=>r.json()).catch(()=>({codes:[]})),
      fetch("/api/prizes").then(r=>r.json()).catch(()=>({prizes:[]})),
      fetch("/api/events").then(r=>r.json()).catch(()=>({events:[]})),
      fetch("/api/config").then(r=>r.json()).catch(()=>({})),
    ]);
    setStats(sd); setCustomers(cd.customers||[]); setCustTotal(cd.total||0);
    setCodes(od.codes||[]); setPrizes(pd.prizes||[]); setEvents(evd.events||[]);
    setCfgBarName(cfd.bar_name||"Botiquim Bar"); setCfgHandle(cfd.bar_handle||"@botiquim.bar");
    setLastSync(new Date()); setLoading(false);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then(r=>r.json()).then(d => {
      if (d.role === "manager") { setAuthed(true); setSessionName(d.userName||"Gestor"); loadAll(); }
    }).catch(()=>{});
  }, [loadAll]);

  // Load birthdays
  const loadBirthdays = useCallback(async (period:string, month:string) => {
    const p = new URLSearchParams({ period }); if (month) p.set("month", month);
    const d = await fetch(`/api/customers/birthdays?${p}`).then(r=>r.json()).catch(()=>({customers:[]}));
    setBirthdays(d.customers||[]);
  }, []);
  useEffect(() => { if (tab==="aniversariantes") loadBirthdays(bPeriod, bMonth); }, [tab, bPeriod, bMonth, loadBirthdays]);

  // Load resgates
  const loadResgates = useCallback(async (period:string, from?:string, to?:string) => {
    const p = new URLSearchParams({ period });
    if (from) p.set("from", from); if (to) p.set("to", to);
    const d = await fetch(`/api/codes/redeemed?${p}`).then(r=>r.json()).catch(()=>({codes:[],prizeBreakdown:[]}));
    setResgates(d.codes||[]); setResgatesBreakdown(d.prizeBreakdown||[]);
  }, []);
  useEffect(() => { if (tab==="resgates") loadResgates(resgatesPeriod); }, [tab, resgatesPeriod, loadResgates]);

  // Load analytics
  const loadAnalytics = useCallback(async (period:string) => {
    const d = await fetch(`/api/analytics?period=${period}`).then(r=>r.json()).catch(()=>({stats:[]}));
    setAnalytics(d.stats||[]);
  }, []);
  useEffect(() => { if (tab==="analitico") loadAnalytics(analyticPeriod); }, [tab, analyticPeriod, loadAnalytics]);

  // Load users
  const loadUsers = useCallback(async () => {
    const d = await fetch("/api/users").then(r=>r.json()).catch(()=>({users:[]}));
    setSysUsers(d.users||[]);
  }, []);
  useEffect(() => { if (tab==="usuarios") loadUsers(); }, [tab, loadUsers]);

  const loadAudit = useCallback(async () => {
    const d = await fetch("/api/audit?limit=100").then(r=>r.json()).catch(()=>({logs:[]}));
    setAuditLogs(d.logs||[]);
  }, []);
  useEffect(() => { if (tab==="auditoria") loadAudit(); }, [tab, loadAudit]);

  async function sendCampaign() {
    if (!campaignMsg.trim()) return;
    setCampaignSending(true); setCampaignResult(null);
    const body: Record<string,unknown> = { segment: campaignSegment, message: campaignMsg };
    if (campaignSegment==="event") body.event_id = campaignEventId;
    if (campaignSegment==="birthday_month") body.birth_month = campaignBirthMonth;
    const res = await fetch("/api/whatsapp/send", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) });
    const d = await res.json();
    setCampaignResult(d); setCampaignSending(false);
  }

  // Load WhatsApp
  const loadWa = useCallback(async () => {
    const [cfgRes, logRes] = await Promise.all([
      fetch("/api/whatsapp/config").then(r=>r.json()).catch(()=>({config:null,templates:[]})),
      fetch("/api/whatsapp/logs?limit=50").then(r=>r.json()).catch(()=>({messages:[]})),
    ]);
    if (cfgRes.config) setWaCfg({ instance_id:cfgRes.config.instance_id||"", token:cfgRes.config.token||"", client_token:cfgRes.config.client_token||"", enabled:cfgRes.config.enabled||false });
    setWaTemplates(cfgRes.templates||[]); setWaLogs(logRes.messages||[]);
  }, []);
  useEffect(() => { if (tab==="whatsapp") loadWa(); }, [tab, loadWa]);

  // Load user analytics detail
  async function loadUserHistory(u: AnalyticUser) {
    setSelectedUser(u);
    const d = await fetch(`/api/analytics?period=${analyticPeriod}&user_id=${u.userId}`).then(r=>r.json()).catch(()=>({userHistory:[]}));
    setUserHistory(d.userHistory||[]);
  }

  const loadCustomers = useCallback(async (page=0, q="") => {
    const res = await fetch(`/api/customers?per_page=50&page=${page}&q=${encodeURIComponent(q)}`).then(r=>r.json()).catch(()=>({customers:[],total:0}));
    setCustomers(res.customers||[]); setCustTotal(res.total||0); setCustPage(page);
  }, []);

  const loadInactives = useCallback(async () => {
    const res = await fetch("/api/customers?per_page=100&inactive=1").then(r=>r.json()).catch(()=>({customers:[]}));
    setInactives(res.customers||[]);
  }, []);

  async function saveCustomer() {
    if (!editCustomer?.id) return;
    setCustomerSaving(true); setCustomerErr("");
    const { id, ...fields } = editCustomer;
    const res = await fetch(`/api/customers/${id}`, {
      method: "PATCH", headers: {"Content-Type":"application/json"},
      body: JSON.stringify(fields),
    });
    const d = await res.json();
    setCustomerSaving(false);
    if (!res.ok) { setCustomerErr(d.error||"Erro ao salvar"); return; }
    setEditCustomer(null);
    loadCustomers(custPage, custQ);
  }

  async function deleteCustomer(c: Customer) {
    const res = await fetch(`/api/customers/${c.id}`, { method: "DELETE" });
    if (res.ok) {
      setDeleteConfirm(null);
      loadCustomers(custPage, custQ);
    }
  }

  async function restoreCustomer(id: string) {
    await fetch(`/api/customers/${id}`, {
      method: "PATCH", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ deleted_at: null }),
    });
    loadInactives();
  }

  // Prize CRUD
  async function savePrize() {
    if (!editPrize?.name?.trim()||!editPrize?.how?.trim()) { setPrizeErr("Nome e instruções obrigatórios"); return; }
    const method = editPrize.id?"PATCH":"POST";
    const res = await fetch("/api/prizes", { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(editPrize) });
    const d = await res.json();
    if (!res.ok) { setPrizeErr(d.error||"Erro ao salvar"); return; }
    setEditPrize(null); setPrizeErr("");
    const pd = await fetch("/api/prizes").then(r=>r.json()).catch(()=>({prizes:[]}));
    setPrizes(pd.prizes||[]);
  }

  async function uploadPrizeImage(prizeId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("prize_id", prizeId);
    const res = await fetch("/api/prizes/upload", { method:"POST", body:form });
    const d   = await res.json();
    if (res.ok) {
      setPrizes(prev => prev.map(p => p.id===prizeId ? {...p, image_url: d.url} : p));
      setEditPrize(x => x ? {...x, image_url: d.url} : x);
    } else {
      alert(d.error || "Erro ao fazer upload da imagem");
    }
  }

  async function removePrizeImage(prizeId: string) {
    await fetch(`/api/prizes/upload?prize_id=${prizeId}`, { method:"DELETE" });
    setPrizes(prev => prev.map(p => p.id===prizeId ? {...p, image_url: undefined} : p));
    setEditPrize(x => x ? {...x, image_url: null} : x);
  }

  // Event CRUD
  async function saveEvent() {
    if (!editEvent?.name?.trim()) { setEventErr("Nome obrigatório"); return; }
    const slug = editEvent.slug || slugify(editEvent.name);
    const method = editEvent.id?"PATCH":"POST";
    await fetch("/api/events", { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify({...editEvent, slug}) });
    setEditEvent(null); setEventErr("");
    const evd = await fetch("/api/events").then(r=>r.json()).catch(()=>({events:[]}));
    setEvents(evd.events||[]);
  }

  // User CRUD
  async function saveUser() {
    if (!editUser?.name?.trim()||!editUser?.username?.trim()) { setUserErr("Nome e usuário são obrigatórios"); return; }
    if (!editUser.id && !editUser.password) { setUserErr("Senha obrigatória para novo usuário"); return; }
    const method = editUser.id?"PATCH":"POST";
    const res = await fetch("/api/users", { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(editUser) });
    const d = await res.json();
    if (!res.ok) { setUserErr(d.error||"Erro ao salvar"); return; }
    setEditUser(null); setUserErr(""); loadUsers();
  }

  // WhatsApp
  async function saveWaCfg() {
    setWaSaving(true); setWaMsg(""); setWaMsgErr(false);
    try {
      const res = await fetch("/api/whatsapp/config", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(waCfg) });
      const d = await res.json();
      if (res.ok) {
        setWaMsg("✅ Configuração salva com sucesso!"); setWaMsgErr(false);
      } else {
        setWaMsg("❌ Erro ao salvar: " + (d.error || "Tente novamente.")); setWaMsgErr(true);
      }
    } catch {
      setWaMsg("❌ Erro de conexão. Tente novamente."); setWaMsgErr(true);
    }
    setWaSaving(false);
    setTimeout(() => setWaMsg(""), 5000);
  }
  async function saveTemplate(tpl:WaTemplate) {
    await fetch("/api/whatsapp/config", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ template_type:tpl.type, body:tpl.body, enabled:tpl.enabled }) });
  }
  async function testWa() {
    const res = await fetch("/api/whatsapp/test", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ phone:cfgWaTest, message:"✅ Teste do sistema Botiquim Bar" }) });
    const d = await res.json();
    setCfgWaMsg(d.ok?"Enviado com sucesso!":"Falha: "+(d.error||"erro"));
    setTimeout(()=>setCfgWaMsg(""),4000);
  }

  // Config
  async function saveBarCfg() {
    await fetch("/api/config", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ bar_name:cfgBarName, bar_handle:cfgHandle }) });
    setCfgMsg("Salvo!"); setTimeout(()=>setCfgMsg(""),2000);
  }

  function doExport() {
    const p = new URLSearchParams();
    if (expFrom) p.set("from",expFrom); if (expTo) p.set("to",expTo);
    if (expBirthMonth) p.set("birth_month",expBirthMonth); if (expPrize) p.set("prize",expPrize);
    if (expCodeStatus) p.set("code_status",expCodeStatus); if (expEvent) p.set("event_id",expEvent);
    window.open(`/api/export?${p}`, "_blank");
  }

  const filteredCodes = codes.filter(c => {
    if (codeFilter==="all") return true; if (codeFilter==="redeemed") return c.redeemed;
    const exp = new Date(c.expires_at)<new Date();
    if (codeFilter==="expired") return exp&&!c.redeemed; if (codeFilter==="pending") return !c.redeemed&&!exp;
    return true;
  });

  function Badge({status}:{status:string}) {
    const cls = status==="redeemed"?"badge-green":status==="expired"?"badge-red":"badge-yellow";
    const label = status==="redeemed"?"Resgatado":status==="expired"?"Expirado":"Pendente";
    return <span className={`badge ${cls}`}>{label}</span>;
  }

  // LOGIN
  if (!authed) return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-zinc-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://mzewaanljgofkcqetsgo.supabase.co/storage/v1/object/public/assets/Logo%20Em%20Alta%20Botiquim.png"
            alt="Botiquim Bar"
            className="w-28 h-28 object-contain mx-auto mb-3 drop-shadow-md"
          />
          <h1 className="text-2xl font-bold" style={{fontFamily:"Playfair Display, serif", color:"#1A1A1A"}}>Painel de Gestão</h1>
          <p className="text-xs mt-1 font-bold uppercase tracking-wider" style={{color:"#C9A84C"}}>Botiquim Bar · Restaurante</p>
        </div>
        <div className="card">
          <div className="mb-4"><label className="label">Usuário</label>
            <input className="input" placeholder="gestor" value={username} onChange={e=>{setUsername(e.target.value);setPassErr("");}} onKeyDown={e=>e.key==="Enter"&&login()}/></div>
          <div className="mb-4"><label className="label">Senha</label>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={e=>{setPassword(e.target.value);setPassErr("");}} onKeyDown={e=>e.key==="Enter"&&login()}/></div>
          {passErr && <p className="text-sm text-red-500 mb-3">{passErr}</p>}
          <button className="btn-primary" onClick={login}>Entrar</button>
          <div className="text-center mt-4"><a href="/" className="text-xs text-zinc-400 underline">← Cadastro de clientes</a></div>
        </div>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="max-w-6xl mx-auto">

        {/* Topbar */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://mzewaanljgofkcqetsgo.supabase.co/storage/v1/object/public/assets/Logo%20Em%20Alta%20Botiquim.png"
              alt="Botiquim"
              className="w-12 h-12 object-contain drop-shadow-sm"
            />
            <div>
              <h1 className="text-xl font-bold leading-tight" style={{fontFamily:"Playfair Display, serif", color:"#1A1A1A"}}>Botiquim Bar</h1>
              <p className="text-xs" style={{color:"#78716c"}}>Olá, {sessionName} · {lastSync && `Atualizado às ${lastSync.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}`}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={loadAll} disabled={loading} className="btn-secondary text-sm">{loading?"...":"↻ Atualizar"}</button>
            <a href="/acesso" className="btn-secondary text-sm">Portal equipe</a>
            <button onClick={logout} className="btn-ghost text-sm">Sair</button>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            {[
              {l:"Clientes",v:stats.totalCustomers,c:"text-blue-600"},{l:"Novos hoje",v:stats.todayRegistrations,c:"text-orange-500"},
              {l:"Resgatados",v:stats.redeemed,c:"text-emerald-600"},{l:"Pendentes",v:stats.pending,c:"text-amber-600"},
              {l:"🎂 Hoje",v:stats.birthday.today,c:"text-pink-600"},
            ].map(s=><div key={s.l} className="stat-card"><p className="text-xs text-zinc-400">{s.l}</p><p className={`text-3xl font-semibold ${s.c}`}>{s.v}</p></div>)}
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 mb-5 overflow-x-auto">
          {TABS.map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-3 py-2.5 text-xs font-bold border-b-2 whitespace-nowrap transition -mb-px uppercase tracking-wider ${tab===t?"border-btq-red text-btq-red":"border-transparent text-zinc-500 hover:text-zinc-700"}`} style={tab===t?{borderColor:"#C41E1E",color:"#C41E1E"}:{}}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {/* ── OVERVIEW ── */}
        {tab==="overview" && stats && (
          <div>
            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="card md:col-span-2">
                <p className="text-sm font-medium mb-4">Cadastros por dia — últimos 30 dias</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={stats.registrationsByDay} margin={{left:-20}}>
                    <XAxis dataKey="date" tick={{fontSize:10,fill:"#a1a1aa"}} tickFormatter={v=>{const d=new Date(v+"T12:00:00");return`${d.getDate()}/${d.getMonth()+1}`;}}/>
                    <YAxis tick={{fontSize:10,fill:"#a1a1aa"}} allowDecimals={false}/>
                    <Tooltip labelFormatter={v=>new Date(v+"T12:00:00").toLocaleDateString("pt-BR")} formatter={v=>[v,"Cadastros"]} contentStyle={{fontSize:12}}/>
                    <Bar dataKey="count" fill="#f97316" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <p className="text-sm font-medium mb-4">Prêmios distribuídos</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart><Pie data={stats.prizeDistribution} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={false}>
                    {stats.prizeDistribution.map((e,i)=><Cell key={i} fill={e.color}/>)}
                  </Pie><Legend formatter={v=><span style={{fontSize:10}}>{v}</span>}/><Tooltip contentStyle={{fontSize:12}}/></PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card">
              <p className="text-sm font-medium mb-4">Exportar clientes (.xlsx)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                <div><label className="label">Cadastro de</label><input className="input" type="date" value={expFrom} onChange={e=>setExpFrom(e.target.value)}/></div>
                <div><label className="label">Cadastro até</label><input className="input" type="date" value={expTo} onChange={e=>setExpTo(e.target.value)}/></div>
                <div><label className="label">Mês aniversário</label><select className="input" value={expBirthMonth} onChange={e=>setExpBirthMonth(e.target.value)}><option value="">Todos</option>{["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select></div>
                <div><label className="label">Prêmio</label><select className="input" value={expPrize} onChange={e=>setExpPrize(e.target.value)}><option value="">Todos</option>{prizes.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}</select></div>
                <div><label className="label">Status do código</label><select className="input" value={expCodeStatus} onChange={e=>setExpCodeStatus(e.target.value)}><option value="">Todos</option><option value="pending">Pendente</option><option value="redeemed">Resgatado</option><option value="expired">Expirado</option></select></div>
                <div><label className="label">Evento</label><select className="input" value={expEvent} onChange={e=>setExpEvent(e.target.value)}><option value="">Todos</option>{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              </div>
              <button className="btn-primary" onClick={doExport}>⬇ Exportar Excel</button>
            </div>
          </div>
        )}

        {/* ── CLIENTES ── */}
        {tab==="clientes" && (
          <div>
            {/* Edit modal */}
            {editCustomer && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl max-h-[90vh] overflow-y-auto">
                  <h2 className="font-semibold text-zinc-900 mb-4">Editar cadastro</h2>
                  <div className="space-y-3">
                    <div><label className="label">Nome completo</label><input className="input" value={editCustomer.name||""} onChange={e=>setEditCustomer(x=>({...x,name:e.target.value}))}/></div>
                    <div><label className="label">Telefone</label><input className="input" value={editCustomer.phone||""} onChange={e=>setEditCustomer(x=>({...x,phone:e.target.value}))}/></div>
                    <div><label className="label">E-mail</label><input className="input" type="email" value={editCustomer.email||""} onChange={e=>setEditCustomer(x=>({...x,email:e.target.value}))}/></div>
                    <div><label className="label">Data de nascimento</label><input className="input" type="date" value={editCustomer.birth_date||""} onChange={e=>setEditCustomer(x=>({...x,birth_date:e.target.value}))}/></div>
                    <div><label className="label">Instagram</label><input className="input" value={editCustomer.instagram||""} onChange={e=>setEditCustomer(x=>({...x,instagram:e.target.value}))}/></div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={!!editCustomer.marketing_consent} onChange={e=>setEditCustomer(x=>({...x,marketing_consent:e.target.checked}))} className="accent-orange-500"/>
                      <label className="text-sm text-zinc-600">Consentimento de marketing (WhatsApp)</label>
                    </div>
                  </div>
                  {customerErr && <p className="text-sm text-red-500 mt-3">{customerErr}</p>}
                  <div className="flex gap-2 mt-5">
                    <button className="btn-primary flex-1" onClick={saveCustomer} disabled={customerSaving}>{customerSaving?"Salvando...":"Salvar"}</button>
                    <button className="btn-secondary flex-1" onClick={()=>{setEditCustomer(null);setCustomerErr("");}}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete confirm modal */}
            {deleteConfirm && (
              <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
                  <div className="text-3xl mb-3 text-center">⚠️</div>
                  <h2 className="font-semibold text-zinc-900 text-center mb-2">Confirmar exclusão</h2>
                  <p className="text-sm text-zinc-500 text-center mb-1">Você está prestes a desativar o cadastro de:</p>
                  <p className="font-semibold text-zinc-900 text-center mb-1">{deleteConfirm.name}</p>
                  <p className="text-xs text-zinc-400 text-center mb-4">O cadastro ficará inativo mas permanece no banco de dados.</p>
                  <div className="flex gap-2">
                    <button className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-medium transition" onClick={()=>deleteCustomer(deleteConfirm)}>Sim, desativar</button>
                    <button className="btn-secondary flex-1" onClick={()=>setDeleteConfirm(null)}>Cancelar</button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 mb-4">
              <input className="input flex-1" placeholder="Buscar por nome, CPF, e-mail ou telefone..." value={custQ}
                onChange={e=>{setCustQ(e.target.value);loadCustomers(0,e.target.value);}}/>
              <span className="text-sm text-zinc-400 self-center whitespace-nowrap">{custTotal} clientes</span>
            </div>
            <div className="card p-0 overflow-hidden mb-3">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-zinc-100">
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Nome</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">CPF</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Telefone</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden lg:table-cell">Aniversário</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Prêmio</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Evento</th>
                  <th className="px-4 py-3"></th>
                </tr></thead>
                <tbody>
                  {customers.map(c=>(
                    <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="px-4 py-3"><p className="font-medium text-zinc-800">{c.name}</p><p className="text-xs text-zinc-400">{c.email}</p></td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-xs hidden md:table-cell">{c.cpf}</td>
                      <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">{c.phone}</td>
                      <td className="px-4 py-3 text-zinc-500 hidden lg:table-cell">{c.birth_date?new Date(c.birth_date+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}):"—"}</td>
                      <td className="px-4 py-3"><span className="badge badge-blue">{c.prize_name||"—"}</span></td>
                      <td className="px-4 py-3 text-xs text-zinc-400 hidden md:table-cell">{c.event_name||"—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={()=>setEditCustomer(c)} className="btn-ghost text-xs px-2 py-1">✏</button>
                          <button onClick={()=>setDeleteConfirm(c)} className="text-red-400 hover:text-red-600 text-xs px-2 py-1">✕</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {customers.length===0&&<p className="text-sm text-zinc-400 text-center py-8">Nenhum cliente.</p>}
            </div>
            {custTotal>50&&(
              <div className="flex items-center justify-between">
                <button className="btn-secondary text-sm" disabled={custPage===0} onClick={()=>loadCustomers(custPage-1,custQ)}>← Anterior</button>
                <span className="text-sm text-zinc-400">Pág. {custPage+1} de {Math.ceil(custTotal/50)}</span>
                <button className="btn-secondary text-sm" disabled={(custPage+1)*50>=custTotal} onClick={()=>loadCustomers(custPage+1,custQ)}>Próxima →</button>
              </div>
            )}

            {/* Inactive customers */}
            <div className="mt-4">
              <button onClick={()=>{setShowInactive(!showInactive);if(!showInactive)loadInactives();}}
                className="text-sm text-zinc-400 hover:text-zinc-600 flex items-center gap-1">
                {showInactive?"▼":"▶"} Cadastros inativos
              </button>
              {showInactive && (
                <div className="card p-0 overflow-hidden mt-2">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-zinc-100">
                      <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Nome</th>
                      <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">CPF</th>
                      <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Desativado em</th>
                      <th className="px-4 py-3"></th>
                    </tr></thead>
                    <tbody>
                      {inactives.map(c=>(
                        <tr key={c.id} className="border-b border-zinc-50">
                          <td className="px-4 py-3 text-zinc-500">{c.name}</td>
                          <td className="px-4 py-3 text-zinc-400 font-mono text-xs hidden md:table-cell">{c.cpf}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs">{c.deleted_at?new Date(c.deleted_at as string).toLocaleDateString("pt-BR"):"—"}</td>
                          <td className="px-4 py-3"><button onClick={()=>restoreCustomer(c.id)} className="text-emerald-500 text-xs hover:text-emerald-700">Reativar</button></td>
                        </tr>
                      ))}
                      {inactives.length===0&&<tr><td colSpan={4} className="text-center text-zinc-400 text-sm py-6">Nenhum cadastro inativo.</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RESGATES ── */}
        {tab==="resgates" && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap items-center">
              {PERIOD_OPTS.map(([v,l])=>(
                <button key={v} onClick={()=>{setResgatesPeriod(v);setResgatesFrom("");setResgatesTo("");}}
                  className={`btn-secondary text-sm ${resgatesPeriod===v&&!resgatesFrom?"border-orange-300 bg-orange-50 text-orange-700":""}`}>{l}</button>
              ))}
              <input className="input w-36" type="date" placeholder="De" value={resgatesFrom} onChange={e=>setResgatesFrom(e.target.value)}/>
              <input className="input w-36" type="date" placeholder="Até" value={resgatesTo} onChange={e=>setResgatesTo(e.target.value)}/>
              {(resgatesFrom||resgatesTo) && <button className="btn-primary text-sm px-4" onClick={()=>loadResgates("custom",resgatesFrom,resgatesTo)}>Filtrar</button>}
              <span className="text-sm text-zinc-400 ml-auto">{resgates.length} resgates</span>
            </div>

            {resgatesBreakdown.length>0&&(
              <div className="card mb-4">
                <p className="text-sm font-medium mb-3">Breakdown por prêmio</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {resgatesBreakdown.map(p=>(
                    <div key={p.name} className="bg-zinc-50 rounded-xl p-3 text-center">
                      <p className="text-2xl font-semibold text-zinc-900">{p.count}</p>
                      <p className="text-xs text-zinc-500 mt-1">{p.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-zinc-100">
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Código</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Prêmio</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Validado por</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Evento</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Data/hora</th>
                </tr></thead>
                <tbody>
                  {resgates.map(c=>(
                    <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                      <td className="px-4 py-3 text-zinc-700">{c.customer_name}</td>
                      <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">{c.prize_name}</td>
                      <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">{c.redeemed_by_name||"—"}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">{c.event_name||"—"}</td>
                      <td className="px-4 py-3 text-zinc-400 text-xs">{c.redeemed_at?new Date(c.redeemed_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resgates.length===0&&<p className="text-sm text-zinc-400 text-center py-8">Nenhum resgate no período.</p>}
            </div>
          </div>
        )}

        {/* ── CÓDIGOS ── */}
        {tab==="codigos" && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {[["all","Todos"],["pending","Pendentes"],["redeemed","Resgatados"],["expired","Expirados"]].map(([v,l])=>(
                <button key={v} onClick={()=>setCodeFilter(v)} className={`btn-secondary text-sm ${codeFilter===v?"border-orange-300 bg-orange-50 text-orange-700":""}`}>{l}</button>
              ))}
              <span className="text-sm text-zinc-400 self-center ml-auto">{filteredCodes.length} códigos</span>
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-zinc-100">
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Código</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Prêmio</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Status</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Emissão</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Expira em</th>
                </tr></thead>
                <tbody>
                  {filteredCodes.slice(0,100).map(c=>{
                    const st = c.redeemed?"redeemed":new Date(c.expires_at)<new Date()?"expired":"pending";
                    return (
                      <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-mono text-xs">{c.code}</td>
                        <td className="px-4 py-3 text-zinc-700">{c.customer_name}</td>
                        <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">{c.prize_name}</td>
                        <td className="px-4 py-3"><Badge status={st}/></td>
                        <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">{c.created_at?new Date(c.created_at).toLocaleDateString("pt-BR"):"—"}</td>
                        <td className="px-4 py-3 text-xs hidden md:table-cell">
                          {c.expires_at ? (
                            <span className={new Date(c.expires_at)<new Date()&&!c.redeemed?"text-red-400":"text-zinc-400"}>
                              {new Date(c.expires_at).toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"})}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredCodes.length===0&&<p className="text-sm text-zinc-400 text-center py-8">Nenhum código.</p>}
            </div>
          </div>
        )}

        {/* ── PRÊMIOS ── */}
        {tab==="premios" && (
          <div>
            {!editPrize ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-zinc-500">Prêmios e probabilidades da roleta</p>
                  <button className="btn-secondary" onClick={()=>setEditPrize({name:"",short:"",how:"",sub:"",color:"#1D9E75",weight:10,validity_hours:24,validity_type:"hours",enabled:true,limit_type:"none",valid_days:null})}>+ Novo</button>
                </div>
                <div className="space-y-2">
                  {prizes.map(p=>{
                    const total=prizes.filter(x=>x.enabled).reduce((s,x)=>s+(x.weight||10),0);
                    const pct=p.enabled&&total>0?Math.round(p.weight/total*100):0;
                    return (
                      <div key={p.id} className="card flex items-center gap-3 py-3">
                        <button onClick={async()=>{await fetch("/api/prizes",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:p.id,enabled:!p.enabled})});setPrizes(prev=>prev.map(x=>x.id===p.id?{...x,enabled:!x.enabled}:x));}}
                          className={`w-9 h-5 rounded-full flex-shrink-0 relative transition ${p.enabled?"bg-emerald-500":"bg-zinc-200"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${p.enabled?"left-4":"left-0.5"}`}/>
                        </button>
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:p.color}}/>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-zinc-800 truncate">{p.name}</p>
                          <p className="text-xs text-zinc-400">Peso {p.weight} · {pct}% · {p.limit_type!=="none"?`⚡ ${p.limit_type}`:"sem limite"} · emitido {p.issued_count||0}x</p>
                        {p.valid_days?.length ? <p className="text-xs mt-0.5" style={{color:"#C41E1E"}}>📅 {p.valid_days.sort((a:number,b:number)=>a-b).map((d:number)=>["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d]).join(", ")}</p> : <p className="text-xs text-zinc-300 mt-0.5">📅 Todos os dias</p>}
                        </div>
                        <button onClick={()=>setEditPrize(p)} className="btn-ghost text-xs px-3 py-1.5">Editar</button>
                        <button onClick={async()=>{if(!confirm("Excluir?"))return;await fetch(`/api/prizes?id=${p.id}`,{method:"DELETE"});setPrizes(prev=>prev.filter(x=>x.id!==p.id));}} className="text-red-400 text-xs px-2">✕</button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="card max-w-lg">
                <div className="flex items-center gap-2 mb-5">
                  <button onClick={()=>{setEditPrize(null);setPrizeErr("");}} className="text-zinc-400 text-lg">←</button>
                  <h2 className="font-semibold">{editPrize.id?"Editar prêmio":"Novo prêmio"}</h2>
                </div>
                {[{l:"Nome do prêmio *",k:"name",ph:"Ex: Chopp grátis!"},{l:"Nome curto na roleta",k:"short",ph:"Ex: Chopp\\ngrátis!"},{l:"Instruções de resgate *",k:"how",ph:"Ex: Peça 1 chopp ao barman."},{l:"Descrição curta",k:"sub",ph:"Ex: Comemore com a gente!"}].map(f=>(
                  <div key={f.k} className="mb-4"><label className="label">{f.l}</label>
                    <input className="input" placeholder={f.ph} value={(editPrize as Record<string,unknown>)[f.k] as string||""} onChange={e=>setEditPrize(x=>({...x,[f.k]:e.target.value}))}/></div>
                ))}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div><label className="label">Cor</label><input className="input h-10" type="color" value={editPrize.color||"#1D9E75"} onChange={e=>setEditPrize(x=>({...x,color:e.target.value}))}/></div>
                  <div><label className="label">Peso (1-100)</label><input className="input" type="number" min={1} max={100} value={editPrize.weight||10} onChange={e=>setEditPrize(x=>({...x,weight:+e.target.value}))}/></div>
                  <div><label className="label">Alternativo</label><select className="input" value={editPrize.fallback_prize_id||""} onChange={e=>setEditPrize(x=>({...x,fallback_prize_id:e.target.value||null}))}><option value="">Outro</option>{prizes.filter(p=>p.id!==editPrize.id).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                </div>
                <div className="mb-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                  <p className="text-xs font-medium text-zinc-600 mb-3">Validade do cupom</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Tipo</label><select className="input" value={editPrize.validity_type||"hours"} onChange={e=>setEditPrize(x=>({...x,validity_type:e.target.value}))}><option value="hours">Horas</option><option value="days">Dias</option><option value="same_day">Somente hoje</option><option value="until_date">Data fixa</option></select></div>
                    {(!editPrize.validity_type||editPrize.validity_type==="hours"||editPrize.validity_type==="days")&&<div><label className="label">{editPrize.validity_type==="days"?"Dias":"Horas"}</label><input className="input" type="number" min={1} value={editPrize.validity_hours||24} onChange={e=>setEditPrize(x=>({...x,validity_hours:+e.target.value}))}/></div>}
                    {editPrize.validity_type==="until_date"&&<div><label className="label">Data limite</label><input className="input" type="date" value={editPrize.validity_until||""} onChange={e=>setEditPrize(x=>({...x,validity_until:e.target.value}))}/></div>}
                  </div>
                </div>
                <div className="mb-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                  <p className="text-xs font-medium text-zinc-600 mb-3">Limitação</p>
                  <div className="mb-3"><label className="label">Tipo</label><select className="input" value={editPrize.limit_type||"none"} onChange={e=>setEditPrize(x=>({...x,limit_type:e.target.value}))}><option value="none">Sem limite</option><option value="per_registrations">A cada X cadastros</option><option value="per_period">Máx. por período</option><option value="total">Total absoluto</option><option value="schedule">Horário</option></select></div>
                  {editPrize.limit_type==="per_registrations"&&<div><label className="label">A cada X cadastros</label><input className="input" type="number" min={1} value={editPrize.limit_every_n_registrations||""} onChange={e=>setEditPrize(x=>({...x,limit_every_n_registrations:+e.target.value}))}/></div>}
                  {editPrize.limit_type==="per_period"&&<div className="grid grid-cols-2 gap-3"><div><label className="label">Máximo</label><input className="input" type="number" min={1} value={editPrize.limit_per_period_count||""} onChange={e=>setEditPrize(x=>({...x,limit_per_period_count:+e.target.value}))}/></div><div><label className="label">Por</label><select className="input" value={editPrize.limit_per_period_type||"day"} onChange={e=>setEditPrize(x=>({...x,limit_per_period_type:e.target.value}))}><option value="day">Dia</option><option value="week">Semana</option><option value="month">Mês</option></select></div></div>}
                  {editPrize.limit_type==="total"&&<div><label className="label">Total máximo</label><input className="input" type="number" min={1} value={editPrize.limit_total_count||""} onChange={e=>setEditPrize(x=>({...x,limit_total_count:+e.target.value}))}/></div>}
                  {editPrize.limit_type==="schedule"&&<div className="grid grid-cols-2 gap-3"><div><label className="label">Das (hora)</label><input className="input" type="number" min={0} max={23} value={editPrize.schedule_start_hour??""} onChange={e=>setEditPrize(x=>({...x,schedule_start_hour:+e.target.value}))}/></div><div><label className="label">Até (hora)</label><input className="input" type="number" min={0} max={24} value={editPrize.schedule_end_hour??""} onChange={e=>setEditPrize(x=>({...x,schedule_end_hour:+e.target.value}))}/></div></div>}
                </div>
                <div className="mb-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                  <p className="text-xs font-medium text-zinc-600 mb-3">Dias de resgate</p>
                  <p className="text-xs text-zinc-400 mb-3">Selecione os dias em que este prêmio pode ser resgatado. Deixe todos desmarcados para permitir qualquer dia.</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[["Dom",0],["Seg",1],["Ter",2],["Qua",3],["Qui",4],["Sex",5],["Sáb",6]].map(([label, num])=>{
                      const days = (editPrize as Record<string,unknown>).valid_days as number[]|null ?? [];
                      const checked = days.includes(num as number);
                      return (
                        <button key={num} type="button"
                          onClick={()=>{
                            const cur = ((editPrize as Record<string,unknown>).valid_days as number[]|null) ?? [];
                            const next = checked ? cur.filter(d=>d!==num) : [...cur, num as number];
                            setEditPrize(x=>({...x, valid_days: next.length>0?next:null}));
                          }}
                          className={`py-2 rounded-xl text-xs font-bold transition border-2 ${checked?"border-btq-red text-btq-red bg-red-50":"border-zinc-200 text-zinc-400 bg-white"}`}
                          style={checked?{borderColor:"#C41E1E",color:"#C41E1E",backgroundColor:"#FEF2F2"}:{}}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {((editPrize as Record<string,unknown>).valid_days as number[]|null)?.length ? (
                    <p className="text-xs text-zinc-500 mt-2">
                      ✅ Resgate permitido: {((editPrize as Record<string,unknown>).valid_days as number[]).sort((a,b)=>a-b).map(d=>["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][d]).join(", ")}
                    </p>
                  ) : (
                    <p className="text-xs text-zinc-400 mt-2">📅 Todos os dias permitidos</p>
                  )}
                </div>

                {editPrize.id && (
                  <div className="mb-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                    <p className="text-xs font-medium text-zinc-600 mb-3">Imagem do prêmio (opcional)</p>
                    {typeof (editPrize as Record<string,unknown>).image_url === "string" && (
                      <div className="mb-3 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={(editPrize as Record<string,unknown>).image_url as string} alt="Prêmio" className="w-20 h-20 object-cover rounded-xl border border-zinc-200"/>
                        <button onClick={()=>removePrizeImage(editPrize.id!)} className="text-red-500 text-xs hover:text-red-700">Remover imagem</button>
                      </div>
                    )}
                    <label className="btn-secondary text-sm cursor-pointer inline-block">
                      {(editPrize as Record<string,unknown>).image_url ? "Trocar imagem" : "📷 Adicionar imagem"}
                      <input type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f&&editPrize.id)uploadPrizeImage(editPrize.id,f);}}/>
                    </label>
                    <p className="text-xs text-zinc-400 mt-1">JPG, PNG ou WEBP · máx 2MB</p>
                  </div>
                )}
                {prizeErr&&<p className="text-sm text-red-500 mb-3">{prizeErr}</p>}
                <div className="flex gap-2"><button className="btn-primary" onClick={savePrize}>Salvar</button><button className="btn-secondary" onClick={()=>{setEditPrize(null);setPrizeErr("");}}>Cancelar</button></div>
              </div>
            )}
          </div>
        )}

        {/* ── EVENTOS ── */}
        {tab==="eventos" && (
          <div>
            {!editEvent ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-zinc-500">QR Codes por evento para rastrear origem dos cadastros</p>
                  <button className="btn-secondary" onClick={()=>setEditEvent({name:"",description:"",active:false,qr_color:"#000000",qr_bg_color:"#ffffff"})}>+ Novo evento</button>
                </div>
                <div className="space-y-3">
                  {events.map(e=>(
                    <div key={e.id} className="card">
                      <div className="flex items-start gap-3">
                        <button onClick={async()=>{await fetch("/api/events",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:e.id,active:!e.active})});const evd=await fetch("/api/events").then(r=>r.json());setEvents(evd.events||[]);}}
                          className={`mt-0.5 w-9 h-5 rounded-full flex-shrink-0 relative ${e.active?"bg-emerald-500":"bg-zinc-200"}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${e.active?"left-4":"left-0.5"}`}/>
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-zinc-800">{e.name}</p>
                            {e.active&&<span className="badge badge-green">Ativo</span>}
                          </div>
                          {e.description&&<p className="text-xs text-zinc-400 mt-0.5">{e.description}</p>}
                          <p className="text-xs font-mono text-zinc-400 mt-1">slug: {e.slug||"—"}</p>
                          <p className="text-xs text-orange-600 font-mono break-all">{typeof window!=="undefined"?window.location.origin:"https://seu-site.vercel.app"}/?event={e.slug||e.id}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                          <button onClick={()=>setEditEvent(e)} className="btn-ghost text-xs px-2 py-1">Editar</button>
                          <button onClick={()=>window.open(`/api/events/${e.id}/qr?size=600`,"_blank")} className="btn-secondary text-xs px-2 py-1">QR 600px</button>
                          <button onClick={()=>window.open(`/api/events/${e.id}/qr?size=1200`,"_blank")} className="btn-secondary text-xs px-2 py-1">QR 1200px</button>
                          <button onClick={async()=>{if(!confirm("Excluir evento?"))return;await fetch(`/api/events?id=${e.id}`,{method:"DELETE"});setEvents(prev=>prev.filter(x=>x.id!==e.id));}} className="text-red-400 text-xs px-2">✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {events.length===0&&<p className="text-sm text-zinc-400">Nenhum evento criado.</p>}
                </div>
              </>
            ) : (
              <div className="card max-w-lg">
                <div className="flex items-center gap-2 mb-5"><button onClick={()=>{setEditEvent(null);setEventErr("");}} className="text-zinc-400 text-lg">←</button><h2 className="font-semibold">{editEvent.id?"Editar evento":"Novo evento"}</h2></div>
                <div className="mb-4"><label className="label">Nome do evento *</label><input className="input" value={editEvent.name||""} onChange={e=>setEditEvent(x=>({...x,name:e.target.value}))}/></div>
                <div className="mb-4"><label className="label">Descrição (banner no cadastro)</label><input className="input" value={editEvent.description||""} onChange={e=>setEditEvent(x=>({...x,description:e.target.value}))}/></div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div><label className="label">Data</label><input className="input" type="date" value={editEvent.date||""} onChange={e=>setEditEvent(x=>({...x,date:e.target.value}))}/></div>
                  <div><label className="label">Slug da URL</label><input className="input" placeholder="auto gerado" value={editEvent.slug||""} onChange={e=>setEditEvent(x=>({...x,slug:slugify(e.target.value)}))}/></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div><label className="label">Cor do QR</label><input className="input h-10" type="color" value={editEvent.qr_color||"#000000"} onChange={e=>setEditEvent(x=>({...x,qr_color:e.target.value}))}/></div>
                  <div><label className="label">Fundo do QR</label><input className="input h-10" type="color" value={editEvent.qr_bg_color||"#ffffff"} onChange={e=>setEditEvent(x=>({...x,qr_bg_color:e.target.value}))}/></div>
                </div>
                <div className="flex items-center gap-2 mb-4"><input type="checkbox" checked={editEvent.active??false} onChange={e=>setEditEvent(x=>({...x,active:e.target.checked}))}/><label className="text-sm text-zinc-600">Evento ativo</label></div>
                {eventErr&&<p className="text-sm text-red-500 mb-3">{eventErr}</p>}
                <div className="flex gap-2"><button className="btn-primary" onClick={saveEvent}>Salvar</button><button className="btn-secondary" onClick={()=>{setEditEvent(null);setEventErr("");}}>Cancelar</button></div>
              </div>
            )}
          </div>
        )}

        {/* ── ANIVERSARIANTES ── */}
        {tab==="aniversariantes" && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {[["today","Hoje"],["week","Esta semana"],["month","Este mês"]].map(([v,l])=>(
                <button key={v} onClick={()=>{setBPeriod(v);setBMonth("");}} className={`btn-secondary text-sm ${bPeriod===v&&!bMonth?"border-orange-300 bg-orange-50 text-orange-700":""}`}>{l}</button>
              ))}
              <select className="input w-auto text-sm" value={bMonth} onChange={e=>{setBMonth(e.target.value);if(e.target.value)setBPeriod("");}}><option value="">Mês específico</option>{["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m,i)=><option key={i} value={i+1}>{m}</option>)}</select>
              <span className="text-sm text-zinc-400 self-center ml-auto">{birthdays.length} aniversariantes</span>
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-zinc-100"><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Nome</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Data</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Telefone</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">WhatsApp</th></tr></thead>
                <tbody>
                  {birthdays.map(c=>{
                    const sent=c.birthday_sent_year===new Date().getFullYear();
                    return (<tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                      <td className="px-4 py-3 font-medium text-zinc-800">{c.name}</td>
                      <td className="px-4 py-3 text-zinc-600">{String(c.bDay).padStart(2,"0")}/{String(c.bMonth).padStart(2,"0")} <span className="text-zinc-400 text-xs">({c.age}a)</span></td>
                      <td className="px-4 py-3 text-zinc-500 hidden md:table-cell">{c.phone}</td>
                      <td className="px-4 py-3">{c.marketing_consent?sent?<span className="badge badge-green">✓ Enviado</span>:<span className="badge badge-yellow">Pendente</span>:<span className="badge badge-gray">Sem consentimento</span>}</td>
                    </tr>);
                  })}
                </tbody>
              </table>
              {birthdays.length===0&&<p className="text-sm text-zinc-400 text-center py-8">Nenhum aniversariante no período.</p>}
            </div>
          </div>
        )}

        {/* ── ANALÍTICO ── */}
        {tab==="analitico" && (
          <div>
            {selectedUser ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={()=>{setSelectedUser(null);setUserHistory([]);}} className="text-zinc-400 text-lg">←</button>
                  <div><p className="font-semibold text-zinc-900">{selectedUser.name}</p><p className="text-xs text-zinc-400">{selectedUser.total} resgates no período</p></div>
                </div>
                <div className="card mb-4">
                  <p className="text-sm font-medium mb-3">Por prêmio</p>
                  <div className="space-y-2">
                    {Object.entries(selectedUser.byPrize).sort((a,b)=>b[1]-a[1]).map(([prize,count])=>(
                      <div key={prize} className="flex items-center justify-between"><span className="text-sm text-zinc-700">{prize}</span><span className="badge badge-blue">{count}x</span></div>
                    ))}
                  </div>
                </div>
                <div className="card p-0 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-zinc-100"><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Código</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Cliente</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Prêmio</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Horário</th></tr></thead>
                    <tbody>
                      {userHistory.map(c=>(
                        <tr key={c.id} className="border-b border-zinc-50"><td className="px-4 py-3 font-mono text-xs">{c.code}</td><td className="px-4 py-3">{c.customer_name}</td><td className="px-4 py-3 text-zinc-500 hidden md:table-cell">{c.prize_name}</td><td className="px-4 py-3 text-zinc-400 text-xs">{c.redeemed_at?new Date(c.redeemed_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {userHistory.length===0&&<p className="text-sm text-zinc-400 text-center py-8">Nenhum resgate.</p>}
                </div>
              </div>
            ) : (
              <div>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {PERIOD_OPTS.map(([v,l])=>(
                    <button key={v} onClick={()=>setAnalyticPeriod(v)} className={`btn-secondary text-sm ${analyticPeriod===v?"border-orange-300 bg-orange-50 text-orange-700":""}`}>{l}</button>
                  ))}
                </div>
                <div className="space-y-3">
                  {analytics.length===0&&<p className="text-sm text-zinc-400">Nenhuma validação no período.</p>}
                  {analytics.map(u=>(
                    <div key={u.userId} className="card cursor-pointer hover:border-orange-200 hover:shadow-sm transition" onClick={()=>loadUserHistory(u)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-zinc-900">{u.name}</p>
                          <p className="text-xs text-zinc-400">{u.role==="manager"?"Gestor":"Funcionário"} {u.lastAt&&`· último resgate ${new Date(u.lastAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}`}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-semibold text-zinc-900">{u.total}</p>
                          <p className="text-xs text-zinc-400">resgates</p>
                        </div>
                      </div>
                      {Object.keys(u.byPrize).length>0&&(
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {Object.entries(u.byPrize).slice(0,3).map(([p,c])=><span key={p} className="badge badge-gray">{p.replace(" grátis!","").replace(" de desconto","")} ({c})</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── USUÁRIOS ── */}
        {tab==="usuarios" && (
          <div>
            {!editUser ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <p className="text-sm text-zinc-500">Gerencie os acessos da equipe</p>
                  <button className="btn-secondary" onClick={()=>setEditUser({name:"",username:"",role:"employee",active:true,password:""})}>+ Novo usuário</button>
                </div>
                <div className="card p-0 overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-zinc-100"><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Nome</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Usuário</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Nível</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Status</th><th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Último acesso</th><th className="px-4 py-3"></th></tr></thead>
                    <tbody>
                      {sysUsers.map(u=>(
                        <tr key={u.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                          <td className="px-4 py-3 font-medium text-zinc-800">{u.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-500">{u.username}</td>
                          <td className="px-4 py-3"><span className={`badge ${u.role==="manager"?"badge-blue":"badge-gray"}`}>{u.role==="manager"?"Gestor":"Funcionário"}</span></td>
                          <td className="px-4 py-3"><span className={`badge ${u.active?"badge-green":"badge-red"}`}>{u.active?"Ativo":"Inativo"}</span></td>
                          <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">{u.last_seen?new Date(u.last_seen).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"Nunca"}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={()=>setEditUser({...u,password:""})} className="btn-ghost text-xs px-2 py-1">Editar</button>
                              <button onClick={async()=>{if(!confirm(u.active?"Desativar usuário?":"Reativar usuário?"))return;await fetch("/api/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:u.id,active:!u.active})});loadUsers();}} className={`text-xs px-2 py-1 rounded ${u.active?"text-red-400 hover:text-red-600":"text-emerald-500 hover:text-emerald-700"}`}>{u.active?"Desativar":"Reativar"}</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sysUsers.length===0&&<p className="text-sm text-zinc-400 text-center py-8">Nenhum usuário criado ainda.<br/><span className="text-xs">O sistema usa as senhas padrão das variáveis de ambiente até que usuários sejam criados.</span></p>}
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-amber-800 mb-1">Acesso padrão (enquanto não houver usuários)</p>
                  <p className="text-xs text-amber-700">Gestor: usuário <code className="bg-amber-100 px-1 rounded">gestor</code> + senha do INITIAL_MANAGER_PASSWORD</p>
                  <p className="text-xs text-amber-700">Funcionário: usuário <code className="bg-amber-100 px-1 rounded">funcionario</code> + senha do INITIAL_EMPLOYEE_PASSWORD</p>
                </div>
              </>
            ) : (
              <div className="card max-w-md">
                <div className="flex items-center gap-2 mb-5"><button onClick={()=>{setEditUser(null);setUserErr("");}} className="text-zinc-400 text-lg">←</button><h2 className="font-semibold">{editUser.id?"Editar usuário":"Novo usuário"}</h2></div>
                <div className="mb-4"><label className="label">Nome completo *</label><input className="input" placeholder="Ex: João Barman" value={editUser.name||""} onChange={e=>setEditUser(x=>({...x,name:e.target.value}))}/></div>
                <div className="mb-4"><label className="label">Usuário (login) *</label><input className="input" placeholder="Ex: joao.barman" value={editUser.username||""} onChange={e=>setEditUser(x=>({...x,username:e.target.value.toLowerCase().replace(/\s/g,".")}))}/><p className="text-xs text-zinc-400 mt-1">Somente letras minúsculas, números e pontos</p></div>
                <div className="mb-4"><label className="label">{editUser.id?"Nova senha (deixe em branco para manter)":"Senha *"}</label><input className="input" type="password" placeholder="••••••••" value={(editUser as Record<string,unknown>).password as string||""} onChange={e=>setEditUser(x=>({...x,password:e.target.value}))}/></div>
                <div className="mb-5"><label className="label">Nível de acesso</label><select className="input" value={editUser.role||"employee"} onChange={e=>setEditUser(x=>({...x,role:e.target.value}))}><option value="employee">Funcionário (somente validação)</option><option value="manager">Gestor (acesso total)</option></select></div>
                {userErr&&<p className="text-sm text-red-500 mb-3">{userErr}</p>}
                <div className="flex gap-2"><button className="btn-primary" onClick={saveUser}>Salvar</button><button className="btn-secondary" onClick={()=>{setEditUser(null);setUserErr("");}}>Cancelar</button></div>
              </div>
            )}
          </div>
        )}

        {/* ── WHATSAPP ── */}
        {tab==="whatsapp" && (
          <div className="space-y-4">
            <div className="card">
              <h3 className="font-semibold mb-4">Configuração Z-API</h3>
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <div><label className="label">Instance ID</label><input className="input" placeholder="Seu Instance ID" value={waCfg.instance_id} onChange={e=>setWaCfg(x=>({...x,instance_id:e.target.value}))}/></div>
                <div><label className="label">Token</label><input className="input" type="password" placeholder="Seu token" value={waCfg.token} onChange={e=>setWaCfg(x=>({...x,token:e.target.value}))}/></div>
              </div>
              <div className="mb-3">
                <label className="label">Client-Token (Segurança Z-API)</label>
                <input className="input" type="password" placeholder="Token de segurança da conta Z-API" value={waCfg.client_token} onChange={e=>setWaCfg(x=>({...x,client_token:e.target.value}))}/>
                <p className="text-xs text-zinc-400 mt-1">Encontre em Z-API → Segurança → Token de segurança da conta</p>
              </div>
              <div className="flex items-center gap-2 mb-4"><input type="checkbox" checked={waCfg.enabled} onChange={e=>setWaCfg(x=>({...x,enabled:e.target.checked}))} className="accent-orange-500"/><label className="text-sm text-zinc-600">Ativar envios automáticos</label></div>
              <button className="btn-primary mb-4" onClick={saveWaCfg} disabled={waSaving}>
                {waSaving ? "Salvando..." : "Salvar configuração"}
              </button>
              {waMsg && (
                <div className={`p-3 rounded-xl text-sm mb-4 ${waMsgErr ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
                  {waMsg}
                </div>
              )}
              <div className="border-t border-zinc-100 pt-4">
                <p className="text-sm font-medium mb-2">Testar envio</p>
                <div className="flex gap-2"><input className="input flex-1" placeholder="(11) 99999-9999" value={cfgWaTest} onChange={e=>setCfgWaTest(e.target.value)}/><button className="btn-secondary" onClick={testWa}>Testar</button></div>
                {cfgWaMsg&&<p className="text-sm text-emerald-600 mt-2">{cfgWaMsg}</p>}
              </div>
            </div>
            {/* Campaign section */}
        <div className="card">
          <h3 className="font-semibold mb-1">📣 Enviar campanha</h3>
          <p className="text-xs text-zinc-400 mb-4">Envie uma mensagem para um grupo de clientes com consentimento de WhatsApp.</p>
          <div className="mb-3">
            <label className="label">Segmento</label>
            <select className="input" value={campaignSegment} onChange={e=>{setCampaignSegment(e.target.value);setCampaignEventId("");setCampaignBirthMonth("");}}>
              <option value="all">Todos com consentimento</option>
              <option value="event">Por evento</option>
              <option value="birthday_month">Aniversariantes do mês</option>
            </select>
          </div>
          {campaignSegment==="event"&&(
            <div className="mb-3"><label className="label">Evento</label>
              <select className="input" value={campaignEventId} onChange={e=>setCampaignEventId(e.target.value)}>
                <option value="">Selecione um evento</option>
                {events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}
          {campaignSegment==="birthday_month"&&(
            <div className="mb-3"><label className="label">Mês</label>
              <select className="input" value={campaignBirthMonth} onChange={e=>setCampaignBirthMonth(e.target.value)}>
                <option value="">Selecione o mês</option>
                {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m,i)=><option key={i} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          <div className="mb-3">
            <label className="label">Mensagem</label>
            <p className="text-xs text-zinc-400 mb-1">Variáveis: {"{nome}"} {"{primeiro_nome}"}</p>
            <textarea className="input font-mono text-sm" rows={4} placeholder="Olá {primeiro_nome}! Temos uma novidade especial para você..." value={campaignMsg} onChange={e=>setCampaignMsg(e.target.value)}/>
          </div>
          {campaignResult&&(
            <div className={`p-3 rounded-xl text-sm mb-3 ${campaignResult.failed>0?"bg-amber-50 border border-amber-200 text-amber-700":"bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
              ✅ Enviado: {campaignResult.sent} · ❌ Falhou: {campaignResult.failed} · Total: {campaignResult.total}
            </div>
          )}
          <button className="btn-primary" onClick={sendCampaign} disabled={campaignSending||!campaignMsg.trim()}>
            {campaignSending?"Enviando...":"📤 Enviar campanha"}
          </button>
        </div>

        {waTemplates.map(tpl=>(
              <div key={tpl.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{tpl.type==="welcome"?"🎉 Boas-vindas":"🎂 Aniversário"}</h3>
                  <div className="flex items-center gap-2"><input type="checkbox" checked={tpl.enabled} onChange={e=>{const u={...tpl,enabled:e.target.checked};setWaTemplates(prev=>prev.map(t=>t.id===tpl.id?u:t));saveTemplate(u);}}/><label className="text-sm text-zinc-500">Ativo</label></div>
                </div>
                <p className="text-xs text-zinc-400 mb-2">Variáveis: {"{nome} {primeiro_nome} {premio} {codigo} {validade} {bar_nome}"}</p>
                <textarea className="input font-mono text-xs" rows={5} value={tpl.body} onChange={e=>{const u={...tpl,body:e.target.value};setWaTemplates(prev=>prev.map(t=>t.id===tpl.id?u:t));}}/>
                <button className="btn-secondary mt-2 text-sm" onClick={()=>saveTemplate(tpl)}>Salvar template</button>
              </div>
            ))}
            <div className="card">
              <h3 className="font-semibold mb-3">Log de mensagens</h3>
              <div className="divide-y divide-zinc-100">
                {waLogs.slice(0,20).map(m=>(
                  <div key={m.id} className="flex items-center justify-between py-2.5">
                    <div><p className="text-sm text-zinc-800">{m.customer_name}</p><p className="text-xs text-zinc-400">{m.phone} · {m.type} · {new Date(m.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</p></div>
                    <span className={`badge ${m.status==="sent"?"badge-green":m.status==="failed"?"badge-red":"badge-yellow"}`}>{m.status}</span>
                  </div>
                ))}
                {waLogs.length===0&&<p className="text-sm text-zinc-400 py-4 text-center">Nenhum envio.</p>}
              </div>
            </div>
          </div>
        )}

        {/* ── AUDITORIA ── */}
        {tab==="auditoria" && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-zinc-500">Registro de todas as ações sensíveis do sistema</p>
              <button onClick={loadAudit} className="btn-secondary text-sm">↻ Atualizar</button>
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-zinc-100">
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Ação</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">Usuário</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3 hidden md:table-cell">IP</th>
                  <th className="text-left text-xs font-medium text-zinc-400 px-4 py-3">Data/hora</th>
                </tr></thead>
                <tbody>
                  {auditLogs.map(log=>{
                    const actionLabels: Record<string,string> = {
                      login_success:"Login", login_failed:"Tentativa de login", logout:"Logout",
                      create_user:"Criou usuário", update_user:"Editou usuário", deactivate_user:"Desativou usuário",
                      create_prize:"Criou prêmio", update_prize:"Editou prêmio", delete_prize:"Excluiu prêmio",
                      create_event:"Criou evento", update_event:"Editou evento", delete_event:"Excluiu evento",
                      redeem_code:"Resgate de código", export_data:"Exportou dados",
                      update_config:"Editou configurações", update_whatsapp:"Editou WhatsApp",
                      delete_customer:"Excluiu cliente", gdpr_delete:"Exclusão LGPD",
                      send_campaign:"Enviou campanha",
                    };
                    const actionColors: Record<string,string> = {
                      login_failed:"badge-red", delete_prize:"badge-red", deactivate_user:"badge-red",
                      delete_event:"badge-red", delete_customer:"badge-red", gdpr_delete:"badge-red",
                      create_prize:"badge-green", create_user:"badge-green", create_event:"badge-green",
                      redeem_code:"badge-blue", export_data:"badge-yellow", send_campaign:"badge-blue",
                    };
                    return (
                      <tr key={log.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <span className={`badge ${actionColors[log.action]||"badge-gray"}`}>{actionLabels[log.action]||log.action}</span>
                          {log.detail?.name && <span className="text-xs text-zinc-400 ml-2">{log.detail.name}</span>}
                          {log.detail?.prize && <span className="text-xs text-zinc-400 ml-2">{log.detail.prize}</span>}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 hidden md:table-cell">{log.user_name||"—"} <span className="text-xs text-zinc-400">({log.user_role||"?"})</span></td>
                        <td className="px-4 py-3 text-zinc-400 text-xs hidden md:table-cell">{log.ip||"—"}</td>
                        <td className="px-4 py-3 text-zinc-400 text-xs">{log.created_at?new Date(log.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {auditLogs.length===0&&<p className="text-sm text-zinc-400 text-center py-8">Nenhuma ação registrada ainda.</p>}
            </div>
          </div>
        )}

        {/* ── CONFIG ── */}
        {tab==="config" && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-semibold mb-4">Estabelecimento</h3>
              <div className="mb-3"><label className="label">Nome do bar</label><input className="input" value={cfgBarName} onChange={e=>setCfgBarName(e.target.value)}/></div>
              <div className="mb-4"><label className="label">Instagram</label><input className="input" value={cfgHandle} onChange={e=>setCfgHandle(e.target.value)}/></div>
              <button className="btn-primary" onClick={saveBarCfg}>Salvar</button>
            </div>
            <div className="card">
              <h3 className="font-semibold mb-4">Alertas de segurança</h3>
              <p className="text-xs text-zinc-400 mb-3">Telefone que receberá alerta via WhatsApp após 3 tentativas de login suspeitas.</p>
              <div className="mb-4">
                <label className="label">Telefone do gestor (com DDD)</label>
                <input className="input" placeholder="(19) 99999-9999" defaultValue=""
                  onBlur={async e=>{
                    await fetch("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({alert_phone:e.target.value.replace(/\D/g,"")})});
                  }}/>
                <p className="text-xs text-zinc-400 mt-1">Salvo automaticamente ao sair do campo.</p>
              </div>
            </div>
            <div className="card">
              <h3 className="font-semibold mb-1">Senhas padrão (fallback)</h3>
              <p className="text-xs text-zinc-400 mb-4">Usadas quando não há usuários criados na aba Usuários. Para criar acessos individuais, use a aba Usuários.</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs text-amber-700">Altere as variáveis de ambiente <code>INITIAL_MANAGER_PASSWORD</code> e <code>INITIAL_EMPLOYEE_PASSWORD</code> no Vercel para mudar as senhas padrão.</p>
              </div>
            </div>
            {cfgMsg&&<div className="md:col-span-2"><p className="text-sm text-emerald-600 text-center">{cfgMsg}</p></div>}
          </div>
        )}

      </div>
    </main>
  );
}
