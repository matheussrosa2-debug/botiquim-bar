import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id, name, username, role, active, last_seen, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { name, username, password, role } = await req.json();
  if (!name || !username || !password) return NextResponse.json({ error: "Nome, usuário e senha são obrigatórios" }, { status: 400 });
  if (!["manager", "employee"].includes(role)) return NextResponse.json({ error: "Nível de acesso inválido" }, { status: 400 });

  const { data, error } = await supabaseAdmin().from("users").insert({
    name: name.trim(),
    username: username.toLowerCase().trim(),
    password_hash: hashPassword(password),
    role,
    active: true,
    created_by: session.userId,
  }).select("id").single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Nome de usuário já existe" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await audit({ action: "create_user", entity: "users", entity_id: data?.id, session, ip, detail: { name, username, role } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { id, name, username, password, role, active } = await req.json();
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const fields: Record<string, unknown> = {};
  if (name     !== undefined) fields.name     = name.trim();
  if (username !== undefined) fields.username  = username.toLowerCase().trim();
  if (role     !== undefined) fields.role      = role;
  if (active   !== undefined) fields.active    = active;
  if (password)               fields.password_hash = hashPassword(password);

  const { error } = await supabaseAdmin().from("users").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({ action: "update_user", entity: "users", entity_id: id, session, ip, detail: { fields: Object.keys(fields) } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  if (id === session.userId) return NextResponse.json({ error: "Você não pode remover seu próprio usuário" }, { status: 400 });

  const { error } = await supabaseAdmin().from("users").update({ active: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({ action: "deactivate_user", entity: "users", entity_id: id, session, ip });
  return NextResponse.json({ ok: true });
}
