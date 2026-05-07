import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export async function GET() {
  const db = supabaseAdmin();
  try {
    const { data, error } = await db
      .from("events")
      .select("id, name, description, date, active, slug, qr_color, qr_bg_color, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ events: data || [] });
  } catch {
    try {
      const { data } = await db
        .from("events")
        .select("id, name, description, date, active, created_at")
        .order("created_at", { ascending: false });
      return NextResponse.json({
        events: (data || []).map(e => ({
          ...e, slug: null, qr_color: "#000000", qr_bg_color: "#ffffff",
        })),
      });
    } catch {
      return NextResponse.json({ events: [] });
    }
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const b    = await req.json();
  const slug = b.slug || slugify(b.name || "evento");
  const db   = supabaseAdmin();

  const { error } = await db.from("events").insert({
    name:        b.name,
    description: b.description || null,
    date:        b.date || null,
    active:      b.active ?? false,
    slug,
    qr_color:    b.qr_color    || "#000000",
    qr_bg_color: b.qr_bg_color || "#ffffff",
  });

  if (error) {
    if (error.message?.includes("column") || error.code === "42703") {
      const { error: e2 } = await db.from("events").insert({
        name: b.name, description: b.description || null,
        date: b.date || null, active: b.active ?? false,
      });
      if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id, ...fields } = await req.json();
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const db = supabaseAdmin();

  // Deactivate all others before activating one
  if (fields.active === true) {
    try { await db.from("events").update({ active: false }).neq("id", id); } catch {}
  }

  const { error } = await db.from("events").update(fields).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const { error } = await supabaseAdmin().from("events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
