import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const type = req.nextUrl.searchParams.get("type");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100");
  let query = supabaseAdmin().from("whatsapp_messages").select("*").order("created_at", { ascending: false }).limit(limit);
  if (type) query = query.eq("type", type);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}
