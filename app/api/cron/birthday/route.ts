import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { serverSpin } from "@/lib/spin";
import { getWaConfig, getTemplate, buildMessage, sendWhatsApp, logMessage } from "@/lib/whatsapp";
import { getConfig } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const db  = supabaseAdmin();
  const now = new Date();
  const month = now.getMonth() + 1;
  const day   = now.getDate();
  const year  = now.getFullYear();

  // Reset daily/weekly/monthly counters — use try/catch (not .catch())
  try { await db.from("prizes").update({ issued_today: 0 }); } catch {}
  if (now.getDay() === 1) { try { await db.from("prizes").update({ issued_this_week: 0 }); } catch {} }
  if (day === 1) { try { await db.from("prizes").update({ issued_this_month: 0 }); } catch {} }

  // Find today's birthdays
  const { data: birthdays } = await db
    .from("customers")
    .select("cpf, name, phone, birth_date, prize_code, marketing_consent, birthday_sent_year, deleted_at")
    .is("deleted_at", null)
    .eq("marketing_consent", true)
    .not("birth_date", "is", null);

  const todayBirthdays = (birthdays || []).filter(c => {
    if (c.birthday_sent_year === year) return false;
    if (!c.birth_date) return false;
    const bd = new Date(c.birth_date + "T12:00:00");
    return bd.getMonth() + 1 === month && bd.getDate() === day;
  });

  const [config, template, barName] = await Promise.all([
    getWaConfig(),
    getTemplate("birthday"),
    getConfig("bar_name"),
  ]);

  const results = { sent: 0, failed: 0, skipped: 0 };

  for (const customer of todayBirthdays) {
    try {
      const spin = await serverSpin(customer.cpf, "birthday");

      if (config?.enabled && template) {
        const expiresAt     = new Date(spin.expiresAt);
        const validityHours = spin.prize.validity_hours || 24;
        const message = buildMessage(template, {
          nome:             customer.name,
          primeiro_nome:    customer.name.split(" ")[0],
          premio:           spin.prize.name,
          codigo:           spin.code,
          validade:         expiresAt.toLocaleString("pt-BR"),
          dias_validade:    String(Math.ceil(validityHours / 24)),
          bar_nome:         barName || "Botiquim Bar",
          data_aniversario: `${String(day).padStart(2,"0")}/${String(month).padStart(2,"0")}`,
        });

        const result = await sendWhatsApp(customer.phone, message, config);
        await logMessage({
          customer_cpf:  customer.cpf,
          customer_name: customer.name,
          phone:         customer.phone,
          type:          "birthday",
          status:        result.ok ? "sent" : "failed",
          message_text:  message,
          error:         result.error,
        });
        result.ok ? results.sent++ : results.failed++;
      } else {
        results.skipped++;
      }

      await db.from("customers").update({ birthday_sent_year: year }).eq("cpf", customer.cpf);
    } catch {
      results.failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    date: `${day}/${month}/${year}`,
    total: todayBirthdays.length,
    ...results,
  });
}
