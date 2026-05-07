import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { encrypt, decrypt } from "@/lib/crypto";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const db = supabaseAdmin();
  const [{ data: cfg }, { data: tpls }] = await Promise.all([
    db.from("whatsapp_config").select("*").limit(1).maybeSingle(),
    db.from("whatsapp_templates").select("*").order("type"),
  ]);

  const config = cfg ? {
    ...cfg,
    // Mask tokens for display — show only last 4 chars
    token:        cfg.token        ? "••••••••••••" + decrypt(cfg.token).slice(-4)        : "",
    client_token: cfg.client_token ? "••••••••••••" + decrypt(cfg.client_token).slice(-4) : "",
    instance_id:  cfg.instance_id || "",
    enabled:      cfg.enabled || false,
  } : null;

  return NextResponse.json({ config, templates: tpls || [] });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await req.json();
  const db   = supabaseAdmin();

  // Template update
  if (body.template_type && body.body !== undefined) {
    await db.from("whatsapp_templates").update({
      body: body.body, enabled: body.enabled ?? true,
      updated_at: new Date().toISOString(),
    }).eq("type", body.template_type);
    return NextResponse.json({ ok: true });
  }

  // Config update — encrypt both tokens before storing
  const { data: existing } = await db
    .from("whatsapp_config").select("id, token, client_token").limit(1).maybeSingle();

  // Keep existing encrypted value if masked value was sent back
  const isMaskedToken       = (body.token || "").startsWith("•");
  const isMaskedClientToken = (body.client_token || "").startsWith("•");

  const newToken       = isMaskedToken       ? (existing?.token || "")        : encrypt(body.token || "");
  const newClientToken = isMaskedClientToken ? (existing?.client_token || "")  : encrypt(body.client_token || "");

  const payload = {
    instance_id:  body.instance_id || "",
    token:        newToken,
    client_token: newClientToken,
    enabled:      body.enabled ?? false,
    updated_at:   new Date().toISOString(),
  };

  if (existing) {
    await db.from("whatsapp_config").update(payload).eq("id", existing.id);
  } else {
    await db.from("whatsapp_config").insert(payload);
  }

  return NextResponse.json({ ok: true });
}
