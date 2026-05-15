import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from("prizes")
    .select("*")
    .order("weight", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prizes: data || [] });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const body = await req.json();
  const db   = supabaseAdmin();

  const payload = {
    name:                        body.name,
    short:                       body.short || "",
    how:                         body.how   || "",
    sub:                         body.sub   || "",
    color:                       body.color || "#1D9E75",
    weight:                      body.weight ?? 10,
    validity_hours:              body.validity_hours ?? 24,
    validity_type:               body.validity_type || "hours",
    validity_until:              body.validity_until || null,
    enabled:                     body.enabled ?? true,
    limit_type:                  body.limit_type || "none",
    limit_every_n_registrations: body.limit_every_n_registrations || null,
    limit_per_period_count:      body.limit_per_period_count || null,
    limit_per_period_type:       body.limit_per_period_type  || null,
    limit_total_count:           body.limit_total_count      || null,
    schedule_start_hour:         body.schedule_start_hour    ?? null,
    schedule_end_hour:           body.schedule_end_hour      ?? null,
    fallback_prize_id:           body.fallback_prize_id      || null,
    estimated_value:             body.estimated_value        ?? 0,
    image_url:                   body.image_url              || null,
    valid_days:                  body.valid_days?.length > 0 ? body.valid_days : null,
  };

  const { data, error } = await db.from("prizes").insert(payload).select("id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({ action: "create_prize", entity: "prizes", entity_id: data?.id, session, ip, detail: { name: body.name } });
  return NextResponse.json({ ok: true, id: data?.id });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  // Handle valid_days — empty array means "all days" (store as null)
  if ("valid_days" in fields) {
    fields.valid_days = fields.valid_days?.length > 0 ? fields.valid_days : null;
  }

  const { error } = await supabaseAdmin().from("prizes").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({ action: "update_prize", entity: "prizes", entity_id: id, session, ip, detail: fields });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin().from("prizes").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await audit({ action: "delete_prize", entity: "prizes", entity_id: id, session, ip });
  return NextResponse.json({ ok: true });
}
