import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { cpfDigits, isTestCPF } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const cpf = req.nextUrl.searchParams.get("cpf");
  if (!cpf) return NextResponse.json({ error: "CPF obrigatório" }, { status: 400 });

  const clean = cpfDigits(cpf);

  // CPF de teste — sempre livre para cadastrar
  if (isTestCPF(clean)) return NextResponse.json({ exists: false });

  const db = supabaseAdmin();
  const { data } = await db
    .from("customers")
    .select("name, prize_code, prize_name, deleted_at")
    .eq("cpf", clean)
    .maybeSingle();

  // Não encontrado ou cliente deletado (LGPD) — pode cadastrar novamente
  if (!data || data.deleted_at) return NextResponse.json({ exists: false });

  let codeStatus = null;
  if (data.prize_code) {
    const { data: code } = await db
      .from("prize_codes")
      .select("redeemed, expires_at")
      .eq("code", data.prize_code)
      .maybeSingle();
    if (code) {
      codeStatus = code.redeemed ? "redeemed" : new Date(code.expires_at) < new Date() ? "expired" : "pending";
    }
  }

  return NextResponse.json({
    exists: true,
    name: data.name,
    prizeCode: data.prize_code,
    prizeName: data.prize_name,
    codeStatus,
  });
}
