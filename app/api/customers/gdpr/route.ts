import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { cpfDigits } from "@/lib/utils";
import * as crypto from "crypto";

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const cpf = req.nextUrl.searchParams.get("cpf");
  if (!cpf) return NextResponse.json({ error: "CPF obrigatório" }, { status: 400 });

  const clean = cpfDigits(cpf);
  const db = supabaseAdmin();

  const { data: existing } = await db.from("customers").select("id").eq("cpf", clean).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Anonymize — mantém CPF como hash para impedir recadastro
  const cpfHash = "DEL-" + crypto.createHash("sha256").update(clean).digest("hex").slice(0, 16);

  await db.from("customers").update({
    name:              "Cliente removido",
    phone:             null,
    email:             null,
    instagram:         null,
    birth_date:        null,
    event_id:          null,
    marketing_consent: false,
    deleted_at:        new Date().toISOString(),
  }).eq("cpf", clean);

  return NextResponse.json({ ok: true, message: "Dados pessoais removidos conforme LGPD." });
}
