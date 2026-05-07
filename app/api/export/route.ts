import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const sp = req.nextUrl.searchParams;
  const from       = sp.get("from");
  const to         = sp.get("to");
  const birthMonth = sp.get("birth_month");
  const prizeName  = sp.get("prize");
  const codeStatus = sp.get("code_status");
  const eventId    = sp.get("event_id");

  const db = supabaseAdmin();

  let query = db
    .from("customers")
    .select("*, prize_codes(redeemed, expires_at, created_at, redeemed_at)")
    .order("created_at", { ascending: false });

  if (from)      query = query.gte("created_at", from + "T00:00:00");
  if (to)        query = query.lte("created_at", to   + "T23:59:59");
  if (prizeName) query = query.eq("prize_name", prizeName);
  if (eventId)   query = query.eq("event_id", eventId);

  const { data: customers, error } = await query.limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const now = new Date();
  const filtered = (customers || []).filter((c: Record<string, unknown>) => {
    if (birthMonth && c.birth_date) {
      const bMonth = new Date((c.birth_date as string) + "T12:00:00").getMonth() + 1;
      if (bMonth !== parseInt(birthMonth)) return false;
    }
    const codes = c.prize_codes as Array<{ redeemed: boolean; expires_at: string; redeemed_at: string }> | undefined;
    if (codeStatus && codes && codes.length > 0) {
      const code    = codes[0];
      const expired = new Date(code.expires_at) < now;
      if (codeStatus === "redeemed" && !code.redeemed) return false;
      if (codeStatus === "expired"  && (!expired || code.redeemed)) return false;
      if (codeStatus === "pending"  && (code.redeemed || expired)) return false;
    } else if (codeStatus) { return false; }
    return true;
  });

  const rows = filtered.map((c: Record<string, unknown>) => {
    const codes   = c.prize_codes as Array<{ redeemed: boolean; expires_at: string; redeemed_at: string }> | undefined;
    const code    = codes?.[0];
    const expired = code ? new Date(code.expires_at) < now : false;
    const status  = !code ? "sem código" : code.redeemed ? "resgatado" : expired ? "expirado" : "pendente";
    const bd      = c.birth_date ? new Date((c.birth_date as string) + "T12:00:00") : null;
    return {
      "Nome":               c.name  || "",
      "CPF":                c.cpf   || "",
      "Telefone":           c.phone || "",
      "E-mail":             c.email || "",
      "Aniversário":        bd ? `${String(bd.getDate()).padStart(2,"0")}/${String(bd.getMonth()+1).padStart(2,"0")}/${bd.getFullYear()}` : "",
      "Mês de Aniversário": bd ? bd.toLocaleString("pt-BR", { month: "long" }) : "",
      "Instagram":          c.instagram  || "",
      "Evento de Origem":   c.event_name || "Cadastro geral",
      "Prêmio Ganho":       c.prize_name || "",
      "Código do Prêmio":   c.prize_code || "",
      "Status do Código":   status,
      "Data de Cadastro":   c.created_at   ? new Date(c.created_at as string).toLocaleString("pt-BR")   : "",
      "Resgatado em":       code?.redeemed_at ? new Date(code.redeemed_at).toLocaleString("pt-BR") : "",
      "WhatsApp Consentido": c.marketing_consent ? "Sim" : "Não",
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = Array(15).fill({ wch: 22 });
  XLSX.utils.book_append_sheet(wb, ws, "Clientes");

  const summaryData = [
    { "Informação": "Total exportado",         "Valor": filtered.length },
    { "Informação": "Data da exportação",       "Valor": now.toLocaleString("pt-BR") },
    { "Informação": "Exportado por",            "Valor": session.userName },
    { "Informação": "Filtro: Cadastro de",      "Valor": from || "todos" },
    { "Informação": "Filtro: Cadastro até",     "Valor": to   || "todos" },
    { "Informação": "Filtro: Mês aniversário",  "Valor": birthMonth ? new Date(2000, parseInt(birthMonth)-1).toLocaleString("pt-BR",{month:"long"}) : "todos" },
    { "Informação": "Filtro: Prêmio",           "Valor": prizeName  || "todos" },
    { "Informação": "Filtro: Status do código", "Valor": codeStatus || "todos" },
    { "Informação": "Filtro: Evento",           "Valor": eventId    || "todos" },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  wsSummary["!cols"] = [{wch:35},{wch:30}];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  const buf      = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  const filename = `clientes_botiquim_${now.toISOString().slice(0,10)}.xlsx`;

  await audit({
    action: "export_data", entity: "customers", session, ip,
    detail: { count: filtered.length, from, to, prizeName, codeStatus },
  });

  return new NextResponse(buf, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
