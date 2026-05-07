import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { subDays, format, eachDayOfInterval } from "date-fns";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "manager") return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const db  = supabaseAdmin();
  const now = new Date();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  let totalCustomers = 0;
  let allCodes: Array<{ redeemed: boolean; expires_at: string; prize_name: string; created_at: string }> = [];
  let allPrizes: Array<{ name: string; color: string }> = [];
  let recentCustomers: Array<{ created_at: string }> = [];
  let waMsgs: Array<{ status: string }> = [];
  let allCust: Array<{ birth_date: string; marketing_consent: boolean }> = [];

  try { const r = await db.from("customers").select("*", { count: "exact", head: true }).is("deleted_at", null); totalCustomers = r.count || 0; } catch {}
  try { const r = await db.from("prize_codes").select("redeemed, expires_at, prize_name, created_at"); allCodes = r.data || []; } catch {}
  try { const r = await db.from("prizes").select("name, color").eq("enabled", true); allPrizes = r.data || []; } catch {}
  try { const r = await db.from("customers").select("created_at").gte("created_at", subDays(now, 30).toISOString()); recentCustomers = r.data || []; } catch {}
  try { const r = await db.from("whatsapp_messages").select("type, status, created_at").gte("created_at", subDays(now, 30).toISOString()); waMsgs = r.data || []; } catch {}
  try { const r = await db.from("customers").select("birth_date, marketing_consent").not("birth_date", "is", null); allCust = r.data || []; } catch {}

  const redeemed = allCodes.filter(c => c.redeemed).length;
  const expired  = allCodes.filter(c => !c.redeemed && new Date(c.expires_at) < now).length;
  const pending  = allCodes.filter(c => !c.redeemed && new Date(c.expires_at) >= now).length;

  const days = eachDayOfInterval({ start: subDays(now, 29), end: now });
  const countByDay: Record<string, number> = {};
  recentCustomers.forEach(c => {
    const d = format(new Date(c.created_at), "yyyy-MM-dd");
    countByDay[d] = (countByDay[d] || 0) + 1;
  });
  const registrationsByDay = days.map(d => ({
    date: format(d, "yyyy-MM-dd"),
    count: countByDay[format(d, "yyyy-MM-dd")] || 0,
  }));

  const prizeColorMap: Record<string, string> = {};
  const prizeCounts: Record<string, { count: number; color: string }> = {};
  allPrizes.forEach(p => { prizeColorMap[p.name] = p.color; });
  allCodes.forEach(c => {
    if (!prizeCounts[c.prize_name]) prizeCounts[c.prize_name] = { count: 0, color: prizeColorMap[c.prize_name] || "#888" };
    prizeCounts[c.prize_name].count++;
  });
  const prizeDistribution = Object.entries(prizeCounts)
    .map(([name, v]) => ({ name, count: v.count, color: v.color }))
    .sort((a, b) => b.count - a.count);

  const todayBirths  = allCust.filter(c => { const bd = new Date(c.birth_date + "T12:00:00"); return bd.getMonth() + 1 === todayM && bd.getDate() === todayD; }).length;
  const monthBirths  = allCust.filter(c => { const bd = new Date(c.birth_date + "T12:00:00"); return bd.getMonth() + 1 === todayM; }).length;
  const consentCount = allCust.filter(c => c.marketing_consent).length;

  const waSent    = waMsgs.filter(m => m.status === "sent").length;
  const waFailed  = waMsgs.filter(m => m.status === "failed").length;
  const todayRegs = countByDay[format(now, "yyyy-MM-dd")] || 0;

  return NextResponse.json({
    totalCustomers,
    totalCodes:         allCodes.length,
    redeemed, pending, expired,
    consentCount,
    todayRegistrations: todayRegs,
    registrationsByDay,
    prizeDistribution,
    birthday: { today: todayBirths, month: monthBirths },
    whatsapp: { sent: waSent, failed: waFailed },
  });
}
