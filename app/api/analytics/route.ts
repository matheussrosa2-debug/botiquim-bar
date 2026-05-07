import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { periodRange } from "@/lib/utils";

// GET /api/analytics?period=today|7days|month|year&from=&to=&user_id=
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp     = req.nextUrl.searchParams;
  const period = sp.get("period") || "month";
  const userId = sp.get("user_id");
  const customFrom = sp.get("from");
  const customTo   = sp.get("to");

  const { from, to } = customFrom && customTo
    ? { from: customFrom + "T00:00:00", to: customTo + "T23:59:59" }
    : periodRange(period);

  const db = supabaseAdmin();

  // Get all users
  const { data: users } = await db
    .from("users")
    .select("id, name, username, role, active")
    .eq("active", true)
    .order("name");

  // Get all redemptions in period
  const { data: redemptions } = await db
    .from("prize_codes")
    .select("redeemed_by_user_id, redeemed_by_name, redeemed_by, redeemed_at, prize_name, customer_name, code")
    .eq("redeemed", true)
    .gte("redeemed_at", from)
    .lte("redeemed_at", to);

  const codes = redemptions || [];

  // Build per-user stats
  const userMap: Record<string, {
    userId: string; name: string; role: string;
    total: number; byPrize: Record<string, number>; lastAt: string | null;
    recentCodes: typeof codes;
  }> = {};

  // Initialize from users table
  (users || []).forEach(u => {
    userMap[u.id] = { userId: u.id, name: u.name, role: u.role, total: 0, byPrize: {}, lastAt: null, recentCodes: [] };
  });

  // Add legacy (no userId — global password)
  codes.forEach(c => {
    const uid = c.redeemed_by_user_id || "legacy";
    if (!userMap[uid]) {
      userMap[uid] = { userId: uid, name: c.redeemed_by_name || c.redeemed_by || "Sistema", role: "employee", total: 0, byPrize: {}, lastAt: null, recentCodes: [] };
    }
    userMap[uid].total++;
    userMap[uid].byPrize[c.prize_name] = (userMap[uid].byPrize[c.prize_name] || 0) + 1;
    if (!userMap[uid].lastAt || c.redeemed_at > userMap[uid].lastAt!) userMap[uid].lastAt = c.redeemed_at;
    if (userMap[uid].recentCodes.length < 5) userMap[uid].recentCodes.push(c);
  });

  // If filtering by specific user, return their full history
  let userHistory = null;
  if (userId) {
    const { data: history } = await db
      .from("prize_codes")
      .select("*")
      .eq("redeemed", true)
      .eq("redeemed_by_user_id", userId)
      .gte("redeemed_at", from)
      .lte("redeemed_at", to)
      .order("redeemed_at", { ascending: false })
      .limit(200);
    userHistory = history || [];
  }

  const stats = Object.values(userMap)
    .filter(u => u.total > 0 || (users||[]).find(x => x.id === u.userId))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ stats, userHistory, period, from, to, totalRedemptions: codes.length });
}
