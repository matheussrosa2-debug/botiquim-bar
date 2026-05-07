import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession, getConfig, setConfig, authenticateUser } from "@/lib/auth";

// GET /api/config — public config (bar name, handle)
export async function GET() {
  const db = supabaseAdmin();
  const { data } = await db.from("config").select("key, value").in("key", ["bar_name", "bar_handle"]);
  const cfg: Record<string, string> = {};
  (data || []).forEach(r => { cfg[r.key] = r.value; });
  return NextResponse.json({
    bar_name:   cfg.bar_name   || "Botiquim Bar",
    bar_handle: cfg.bar_handle || "@botiquim.bar",
  });
}

// POST /api/config — update settings (manager only)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();

  // Password change — verify current password using authenticateUser
  if (body.current !== undefined) {
    const user = await authenticateUser("gestor", body.current);
    if (!user) return NextResponse.json({ error: "Senha atual incorreta" }, { status: 403 });
    if (body.manager_password?.trim())  await setConfig("manager_password",  body.manager_password.trim());
    if (body.employee_password?.trim()) await setConfig("employee_password", body.employee_password.trim());
    return NextResponse.json({ ok: true });
  }

  // Bar config
  if (body.bar_name)   await setConfig("bar_name",   body.bar_name);
  if (body.bar_handle) await setConfig("bar_handle",  body.bar_handle);
  return NextResponse.json({ ok: true });
}
