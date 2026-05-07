import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { data } = await supabaseAdmin()
    .from("events")
    .select("id, name, description, date, active, slug, custom_prize_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "Evento não encontrado" }, { status: 404 });
  return NextResponse.json({ event: data });
}
