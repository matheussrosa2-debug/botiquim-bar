import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const db = supabaseAdmin();

  const { data, error } = await db
    .from("prize_codes")
    .select("*")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error) return NextResponse.json({ error: "Erro ao buscar código. Tente novamente." }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Código não encontrado. Verifique os caracteres." }, { status: 404 });
  if (data.redeemed) return NextResponse.json({ error: "Este código já foi utilizado anteriormente." }, { status: 409 });
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: "Este código está expirado." }, { status: 410 });

  const { error: updateError } = await db.from("prize_codes").update({
    redeemed:            true,
    redeemed_at:         new Date().toISOString(),
    redeemed_by:         session.role,
    redeemed_by_user_id: session.userId   || null,
    redeemed_by_name:    session.userName || session.role,
  }).eq("code", code.toUpperCase().trim());

  if (updateError) return NextResponse.json({ error: "Erro ao resgatar. Tente novamente." }, { status: 500 });

  await audit({
    action: "redeem_code", entity: "prize_codes", entity_id: data.id,
    session, ip,
    detail: { code: data.code, prize: data.prize_name, customer: data.customer_name },
  });

  return NextResponse.json({ ok: true, prizeName: data.prize_name, customerName: data.customer_name });
}
