import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { genCode, cpfDigits } from "@/lib/utils";

// GET /api/codes — list codes (staff+)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const db = supabaseAdmin();
  const filter = req.nextUrl.searchParams.get("filter");
  const limit  = parseInt(req.nextUrl.searchParams.get("limit") || "500");

  let query = db.from("prize_codes").select("*").order("created_at", { ascending: false }).limit(limit);
  if (filter === "redeemed") query = query.eq("redeemed", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data });
}

// POST /api/codes — issue prize code after spin
export async function POST(req: NextRequest) {
  const { cpf, prize_id } = await req.json();
  const clean = cpfDigits(cpf);
  const db = supabaseAdmin();

  // Get prize
  const { data: prize } = await db.from("prizes").select("*").eq("id", prize_id).single();
  if (!prize) return NextResponse.json({ error: "Prêmio não encontrado" }, { status: 404 });

  // Get customer
  const { data: customer } = await db.from("customers").select("name, phone, cpf, event_id, event_name").eq("cpf", clean).single();
  if (!customer) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Generate unique code
  let code = genCode();
  let attempts = 0;
  while (attempts < 10) {
    const { data: exists } = await db.from("prize_codes").select("code").eq("code", code).maybeSingle();
    if (!exists) break;
    code = genCode();
    attempts++;
  }

  const now      = new Date();
  const expiresAt = new Date(now.getTime() + (prize.validity_hours || 24) * 3600 * 1000);

  const { error } = await db.from("prize_codes").insert({
    code,
    customer_cpf:        customer.cpf,
    customer_name:       customer.name,
    customer_phone:      customer.phone,
    prize_name:          prize.name,
    prize_how:           prize.how,
    prize_validity_hours: prize.validity_hours || 24,
    expires_at:          expiresAt.toISOString(),
    event_id:            customer.event_id   || null,
    event_name:          customer.event_name || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update customer record with code
  await db.from("customers").update({ prize_code: code, prize_name: prize.name }).eq("cpf", clean);

  return NextResponse.json({ code, expires_at: expiresAt.toISOString() });
}
