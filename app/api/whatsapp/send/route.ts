import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { getWaConfig, buildMessage, sendWhatsApp, logMessage } from "@/lib/whatsapp";
import { audit } from "@/lib/audit";

// POST /api/whatsapp/send
// Sends a campaign message to a segmented group of customers
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const ip   = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const body = await req.json();
  const { segment, message, event_id, birth_month } = body;

  if (!message?.trim()) return NextResponse.json({ error: "Mensagem obrigatória" }, { status: 400 });

  const config = await getWaConfig();
  if (!config?.enabled) return NextResponse.json({ error: "WhatsApp não está ativado nas configurações." }, { status: 400 });

  const db = supabaseAdmin();

  // Build customer query based on segment
  let query = db
    .from("customers")
    .select("name, phone, cpf, birth_date")
    .eq("marketing_consent", true)
    .is("deleted_at", null);

  if (segment === "event" && event_id) {
    query = query.eq("event_id", event_id);
  } else if (segment === "birthday_month" && birth_month) {
    // Filter by birth month using PostgreSQL extract
    const { data: all } = await db
      .from("customers")
      .select("name, phone, cpf, birth_date")
      .eq("marketing_consent", true)
      .is("deleted_at", null)
      .not("birth_date", "is", null);

    const month = parseInt(birth_month);
    const customers = (all || []).filter(c => {
      if (!c.birth_date) return false;
      return new Date(c.birth_date + "T12:00:00").getMonth() + 1 === month;
    });

    return sendCampaign(customers, message, config, session, ip, db, segment, customers.length);
  }

  const { data: customers } = await query.limit(500);

  return sendCampaign(customers || [], message, config, session, ip, db, segment, (customers || []).length);
}

async function sendCampaign(
  customers: Array<{ name: string; phone: string; cpf: string; birth_date?: string }>,
  messageTemplate: string,
  config: NonNullable<Awaited<ReturnType<typeof getWaConfig>>>,
  session: NonNullable<Awaited<ReturnType<typeof import("@/lib/auth").getSession>>>,
  ip: string,
  db: ReturnType<typeof supabaseAdmin>,
  segment: string,
  total: number
) {
  if (customers.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, total: 0, message: "Nenhum cliente encontrado para o segmento selecionado." });
  }

  let sent = 0, failed = 0;

  for (const customer of customers) {
    const msg = buildMessage(messageTemplate, {
      nome:          customer.name,
      primeiro_nome: customer.name.split(" ")[0],
    });

    const result = await sendWhatsApp(customer.phone, msg, config);

    await logMessage({
      customer_cpf:  customer.cpf,
      customer_name: customer.name,
      phone:         customer.phone,
      type:          "campaign",
      status:        result.ok ? "sent" : "failed",
      message_text:  msg,
      error:         result.error,
    });

    result.ok ? sent++ : failed++;

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300));
  }

  await audit({
    action: "send_campaign", entity: "customers", session, ip,
    detail: { segment, total, sent, failed },
  });

  return NextResponse.json({ ok: true, sent, failed, total });
}
