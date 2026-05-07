import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWaConfig, sendWhatsApp } from "@/lib/whatsapp";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { phone, message } = await req.json();
  if (!phone || !message) return NextResponse.json({ error: "Telefone e mensagem obrigatórios" }, { status: 400 });
  const config = await getWaConfig();
  if (!config) return NextResponse.json({ error: "WhatsApp não configurado" }, { status: 400 });
  const result = await sendWhatsApp(phone, message, config);
  return NextResponse.json(result);
}
