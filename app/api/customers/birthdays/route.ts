import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

// GET /api/customers/birthdays?period=today|week|month&month=1-12
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const period = req.nextUrl.searchParams.get("period") || "month";
  const monthParam = req.nextUrl.searchParams.get("month");
  const db = supabaseAdmin();

  const now = new Date();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  const { data: all } = await db.from("customers")
    .select("id, name, phone, email, cpf, birth_date, prize_code, prize_name, marketing_consent, birthday_sent_year, welcome_sent")
    .is("deleted_at", null)
    .not("birth_date", "is", null)
    .order("birth_date");

  const customers = (all || []).map(c => {
    const bd = new Date(c.birth_date + "T12:00:00");
    const bMonth = bd.getMonth() + 1;
    const bDay   = bd.getDate();
    const age    = now.getFullYear() - bd.getFullYear();
    return { ...c, bMonth, bDay, age };
  });

  let filtered = customers;

  if (monthParam) {
    const m = parseInt(monthParam);
    filtered = customers.filter(c => c.bMonth === m);
  } else if (period === "today") {
    filtered = customers.filter(c => c.bMonth === todayM && c.bDay === todayD);
  } else if (period === "week") {
    filtered = customers.filter(c => {
      const thisYear = new Date(now.getFullYear(), c.bMonth - 1, c.bDay);
      const diff = (thisYear.getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    });
  } else if (period === "month") {
    filtered = customers.filter(c => c.bMonth === todayM);
  }

  // Sort by day
  filtered.sort((a, b) => a.bDay - b.bDay);

  return NextResponse.json({ customers: filtered, total: filtered.length });
}
