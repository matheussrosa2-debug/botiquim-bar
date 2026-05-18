import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";

const DAY_NAMES = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

function checkValidDay(validDays: number[] | null): {
  isValid: boolean; validDaysText: string; nextValidDate: string | null;
} {
  if (!validDays || validDays.length === 0) {
    return { isValid: true, validDaysText: "Todos os dias", nextValidDate: null };
  }
  const today   = new Date().getDay();
  const isValid = validDays.includes(today);
  const sorted  = [...validDays].sort((a, b) => a - b);
  const validDaysText = sorted.map(d => DAY_NAMES[d]).join(", ");

  let nextValidDate: string | null = null;
  if (!isValid) {
    for (let i = 1; i <= 7; i++) {
      const next = (today + i) % 7;
      if (validDays.includes(next)) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        nextValidDate = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
        break;
      }
    }
  }
  return { isValid, validDaysText, nextValidDate };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Código obrigatório" }, { status: 400 });

  const db = supabaseAdmin();

  // Query 1: get the prize code — simple, no JOIN
  const { data, error } = await db
    .from("prize_codes")
    .select("id, code, customer_name, redeemed, redeemed_at, expires_at, prize_name, prize_how, customer_cpf")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error) {
    console.error("validate error:", error);
    return NextResponse.json({ found: false, error: "Erro ao consultar código" });
  }
  if (!data) return NextResponse.json({ found: false });

  const expired = new Date(data.expires_at) < new Date();

  // Query 2: get prize valid_days separately by name — no foreign key needed
  let validDays: number[] | null = null;
  try {
    const { data: prize } = await db
      .from("prizes")
      .select("valid_days")
      .eq("name", data.prize_name)
      .maybeSingle();
    validDays = prize?.valid_days ?? null;
  } catch {
    // If prize lookup fails, allow all days
    validDays = null;
  }

  // Query 3: get customer phone separately
  let customerPhone = "—";
  try {
    const { data: customer } = await db
      .from("customers")
      .select("phone")
      .eq("cpf", data.customer_cpf)
      .maybeSingle();
    customerPhone = customer?.phone || "—";
  } catch {
    customerPhone = "—";
  }

  const dayCheck = checkValidDay(validDays);

  return NextResponse.json({
    found:         true,
    valid:         !data.redeemed && !expired && dayCheck.isValid,
    redeemed:      data.redeemed,
    expired,
    dayInvalid:    !dayCheck.isValid,
    code:          data.code,
    customerName:  data.customer_name || "—",
    customerPhone,
    prizeName:     data.prize_name,
    prizeHow:      data.prize_how || "",
    expiresAt:     data.expires_at,
    redeemedAt:    data.redeemed_at || null,
    validDaysText: dayCheck.validDaysText,
    nextValidDate: dayCheck.nextValidDate,
  });
}
