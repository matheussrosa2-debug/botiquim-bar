import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

const DAY_NAMES = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

function checkValidDay(validDays: number[] | null): { isValid: boolean; validDaysText: string } {
  if (!validDays || validDays.length === 0) return { isValid: true, validDaysText: "Todos os dias" };
  const today   = new Date().getDay();
  const isValid = validDays.includes(today);
  const sorted  = [...validDays].sort((a, b) => a - b);
  return { isValid, validDaysText: sorted.map(d => DAY_NAMES[d]).join(", ") };
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const db = supabaseAdmin();

  // Query 1: get the prize code — simple, no JOIN
  const { data, error } = await db
    .from("prize_codes")
    .select("id, code, customer_name, redeemed, redeemed_at, expires_at, prize_name, customer_cpf")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Erro ao buscar código. Tente novamente." }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Código não encontrado. Verifique os caracteres." }, { status: 404 });
  if (data.redeemed) return NextResponse.json({ error: "Este código já foi utilizado anteriormente." }, { status: 409 });
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: "Este código está expirado." }, { status: 410 });

  // Query 2: check valid days separately
  let validDays: number[] | null = null;
  try {
    const { data: prize } = await db
      .from("prizes")
      .select("valid_days")
      .eq("name", data.prize_name)
      .maybeSingle();
    validDays = prize?.valid_days ?? null;
  } catch {
    validDays = null;
  }

  const dayCheck = checkValidDay(validDays);
  if (!dayCheck.isValid) {
    return NextResponse.json({
      error: `Este prêmio só pode ser resgatado às ${dayCheck.validDaysText}.`,
      dayInvalid: true,
      validDaysText: dayCheck.validDaysText,
    }, { status: 422 });
  }

  // Update prize_codes — only safe columns
  const updateData: Record<string, unknown> = {
    redeemed:    true,
    redeemed_at: new Date().toISOString(),
    redeemed_by: session.role,
  };

  // Try to add redeemed_by_name and redeemed_by_user_id if they exist
  try {
    await db.from("prize_codes").update({
      ...updateData,
      redeemed_by_name:    session.userName || session.role,
      redeemed_by_user_id: session.userId || null,
    }).eq("code", code.toUpperCase().trim());
  } catch {
    // Fallback without optional columns
    await db.from("prize_codes").update(updateData).eq("code", code.toUpperCase().trim());
  }

  await audit({
    action: "redeem_code", entity: "prize_codes", entity_id: data.id,
    session, ip,
    detail: { code: data.code, prize: data.prize_name, customer: data.customer_name },
  });

  return NextResponse.json({ ok: true, prizeName: data.prize_name, customerName: data.customer_name });
}
