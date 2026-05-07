import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const ip   = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const body = await req.json();

  // Only allow safe fields to be updated
  const allowed = ["name","phone","email","birth_date","instagram","event_name","marketing_consent"];
  const fields: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) fields[key] = body[key];
  }

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  fields.updated_at = new Date().toISOString();

  const { error } = await supabaseAdmin()
    .from("customers")
    .update(fields)
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({
    action: "update_customer",
    entity: "customers",
    entity_id: id,
    session,
    ip,
    detail: { updated_fields: Object.keys(fields) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Soft delete — just set deleted_at, never removes from DB
  const { data: customer } = await supabaseAdmin()
    .from("customers")
    .select("name, cpf")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabaseAdmin()
    .from("customers")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({
    action: "delete_customer",
    entity: "customers",
    entity_id: id,
    session,
    ip,
    detail: { name: customer?.name, cpf: customer?.cpf },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabaseAdmin()
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  return NextResponse.json({ customer: data });
}
