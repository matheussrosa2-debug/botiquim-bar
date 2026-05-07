import { supabaseAdmin } from "./supabase";
import { genCode } from "./utils";

export type Prize = {
  id: string; name: string; short: string; how: string; sub: string;
  color: string; weight: number; validity_hours: number; validity_type: string;
  validity_until: string | null; enabled: boolean; sort_order: number;
  limit_type: string;
  limit_every_n_registrations: number | null;
  limit_per_period_count: number | null;
  limit_per_period_type: string | null;
  limit_total_count: number | null;
  schedule_start_hour: number | null;
  schedule_end_hour: number | null;
  fallback_prize_id: string | null;
  issued_count: number;
  issued_today: number;
  issued_this_week: number;
  issued_this_month: number;
};

export type SpinResult = {
  prize: Prize;
  targetIndex: number;
  allPrizes: Prize[];
  code: string;
  expiresAt: string;
};

function calcExpiry(prize: Prize): Date {
  const now = new Date();
  switch (prize.validity_type) {
    case "days":
      return new Date(now.getTime() + (prize.validity_hours || 1) * 86400000);
    case "same_day":
      const eod = new Date(now);
      eod.setHours(23, 59, 59, 999);
      return eod;
    case "until_date":
      if (prize.validity_until) return new Date(prize.validity_until + "T23:59:59");
      return new Date(now.getTime() + 86400000);
    case "hours":
    default:
      return new Date(now.getTime() + (prize.validity_hours || 24) * 3600000);
  }
}

function isPrizeEligible(prize: Prize, totalCustomers: number, hour: number): boolean {
  switch (prize.limit_type) {
    case "per_registrations":
      if (!prize.limit_every_n_registrations) return true;
      return totalCustomers > 0 && totalCustomers % prize.limit_every_n_registrations === 0;

    case "per_period":
      const count =
        prize.limit_per_period_type === "week"  ? prize.issued_this_week  :
        prize.limit_per_period_type === "month" ? prize.issued_this_month :
        prize.issued_today;
      return count < (prize.limit_per_period_count ?? 999);

    case "total":
      return prize.issued_count < (prize.limit_total_count ?? 999);

    case "schedule":
      return hour >= (prize.schedule_start_hour ?? 0) &&
             hour <  (prize.schedule_end_hour   ?? 24);

    default:
      return true;
  }
}

export async function serverSpin(cpfClean: string, type: "wheel" | "birthday" = "wheel"): Promise<SpinResult> {
  const db = supabaseAdmin();

  const [{ data: prizes }, { count: totalCustomers }] = await Promise.all([
    db.from("prizes").select("*").eq("enabled", true).order("weight", { ascending: false }),
    db.from("customers").select("*", { count: "exact", head: true }),
  ]);

  const allPrizes = (prizes || []) as Prize[];
  const hour = new Date().getHours();
  const total = totalCustomers ?? 0;

  // Build eligible pool (with fallback resolution)
  const ineligibleIds = new Set<string>();
  for (const p of allPrizes) {
    if (!isPrizeEligible(p, total, hour)) ineligibleIds.add(p.id);
  }

  const eligible = allPrizes.filter(p => {
    if (!ineligibleIds.has(p.id)) return true;
    if (p.fallback_prize_id && !ineligibleIds.has(p.fallback_prize_id)) return false; // fallback handles it
    return false;
  });

  // Add fallbacks for ineligible prizes
  for (const p of allPrizes) {
    if (ineligibleIds.has(p.id) && p.fallback_prize_id) {
      const fb = allPrizes.find(x => x.id === p.fallback_prize_id);
      if (fb && !eligible.find(x => x.id === fb.id)) eligible.push(fb);
    }
  }

  const pool = eligible.length > 0 ? eligible : allPrizes; // never empty

  // Weighted random pick
  const totalWeight = pool.reduce((s, p) => s + (p.weight || 10), 0);
  let rand = Math.random() * totalWeight;
  let selected = pool[0];
  for (const p of pool) {
    rand -= p.weight || 10;
    if (rand <= 0) { selected = p; break; }
  }

  // Update counters
  await db.from("prizes").update({
    issued_count:      (selected.issued_count      || 0) + 1,
    issued_today:      (selected.issued_today      || 0) + 1,
    issued_this_week:  (selected.issued_this_week  || 0) + 1,
    issued_this_month: (selected.issued_this_month || 0) + 1,
    last_issued_at:    new Date().toISOString(),
  }).eq("id", selected.id);

  // Record issuance
  await db.from("prize_issuances").insert({
    prize_id: selected.id, customer_cpf: cpfClean,
    registration_number: total,
  }).then(() => {});

  // Generate unique code
  let code = genCode();
  for (let i = 0; i < 10; i++) {
    const { data } = await db.from("prize_codes").select("code").eq("code", code).maybeSingle();
    if (!data) break;
    code = genCode();
  }

  const expiresAt = calcExpiry(selected);

  // Save code
  const { data: customer } = await db.from("customers")
    .select("name, phone, event_id, event_name").eq("cpf", cpfClean).single();

  await db.from("prize_codes").insert({
    code,
    customer_cpf:        cpfClean,
    customer_name:       customer?.name ?? "",
    customer_phone:      customer?.phone ?? "",
    prize_name:          selected.name,
    prize_how:           selected.how,
    prize_validity_hours: selected.validity_hours || 24,
    expires_at:          expiresAt.toISOString(),
    type,
    event_id:            customer?.event_id   ?? null,
    event_name:          customer?.event_name ?? null,
  });

  // Update customer with code
  await db.from("customers").update({
    prize_code: code, prize_name: selected.name,
  }).eq("cpf", cpfClean);

  const targetIndex = allPrizes.findIndex(p => p.id === selected.id);

  return { prize: selected, targetIndex, allPrizes, code, expiresAt: expiresAt.toISOString() };
}
