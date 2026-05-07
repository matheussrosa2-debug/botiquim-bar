import { NextRequest, NextResponse } from "next/server";
import { serverSpin } from "@/lib/spin";
import { cpfDigits, isTestCPF } from "@/lib/utils";
import { sendWelcome } from "@/lib/whatsapp";
import { getConfig } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const { cpf } = await req.json();
  if (!cpf) return NextResponse.json({ error: "CPF obrigatório" }, { status: 400 });

  const clean  = cpfDigits(cpf);
  const isTest = isTestCPF(clean);
  const db     = supabaseAdmin();

  const { data: customer, error } = await db
    .from("customers")
    .select("name, phone, prize_code, marketing_consent")
    .eq("cpf", clean)
    .maybeSingle();

  if (error)    return NextResponse.json({ error: "Erro ao buscar cadastro. Tente novamente." }, { status: 500 });
  if (!customer) return NextResponse.json({ error: "Cadastro não encontrado. Tente se cadastrar novamente." }, { status: 404 });

  if (!isTest && customer.prize_code) {
    return NextResponse.json({ error: "Você já participou da roleta! Cada CPF pode girar apenas uma vez." }, { status: 409 });
  }

  try {
    const result = await serverSpin(clean, "wheel");

    if (customer.marketing_consent) {
      const barName = await getConfig("bar_name");
      sendWelcome({
        cpf: clean, name: customer.name, phone: customer.phone,
        prize_name: result.prize.name, prize_code: result.code,
        expires_at: result.expiresAt, bar_name: barName || "Botiquim Bar",
      }).catch(() => {});
    }

    return NextResponse.json({
      prize:       result.prize,
      targetIndex: result.targetIndex,
      allPrizes:   result.allPrizes,
      code:        result.code,
      expires_at:  result.expiresAt,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Erro ao sortear prêmio. Tente novamente." }, { status: 500 });
  }
}
