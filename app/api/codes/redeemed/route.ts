import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { periodRange } from "@/lib/utils";

// GET /api/codes/redeemed?period=today|7days|month|year&from=&to=&user_id=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const period = sp.get("period") || "today";
  const userId = sp.get("user_id");
  const customFrom = sp.get("from");
  const customTo   = sp.get("to");

  const { from, to } = customFrom && customTo
    ? { from: customFrom + "T00:00:00", to: customTo + "T23:59:59" }
    : periodRange(period);

  let query = supabaseAdmin()
    .from("prize_codes")
    .select("*")
    .eq("redeemed", true)
    .gte("redeemed_at", from)
    .lte("redeemed_at", to)
    .order("redeemed_at", { ascending: false });

  // Employees can only see their own redemptions
  if (session.role === "employee" && session.userId) {
    query = query.eq("redeemed_by_user_id", session.userId);
  } else if (userId) {
    query = query.eq("redeemed_by_user_id", userId);
  }

  const { data, error } = await query.limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const codes = data || [];

  // Summary breakdown by prize
  const byPrize: Record<string, number> = {};
  codes.forEach(c => { byPrize[c.prize_name] = (byPrize[c.prize_name] || 0) + 1; });
  const prizeBreakdown = Object.entries(byPrize)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    codes,
    total: codes.length,
    prizeBreakdown,
    period,
    from,
    to,
  });
}
