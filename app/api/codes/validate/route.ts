import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("prize_codes")
    .select("*, customers(name, phone)")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error) return NextResponse.json({ found: false, error: "Erro ao consultar código" });
  if (!data)  return NextResponse.json({ found: false });

  const expired  = new Date(data.expires_at) < new Date();
  const customer = data.customers as { name: string; phone: string } | null;

  return NextResponse.json({
    found:        true,
    valid:        !data.redeemed && !expired,
    redeemed:     data.redeemed,
    expired,
    code:         data.code,
    customerName: customer?.name || data.customer_name || "—",
    customerPhone:customer?.phone || "—",
    prizeName:    data.prize_name,
    prizeHow:     data.prize_how  || "",
    expiresAt:    data.expires_at,
    redeemedAt:   data.redeemed_at || null,
  });
}
