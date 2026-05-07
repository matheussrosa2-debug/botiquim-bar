import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const limit  = Math.min(parseInt(sp.get("limit") || "100"), 500);
  const action = sp.get("action");
  const userId = sp.get("user_id");

  let query = supabaseAdmin()
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) query = query.eq("action", action);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}
