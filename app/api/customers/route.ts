import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getSession } from "@/lib/auth";
import { cpfDigits, isTestCPF } from "@/lib/utils";

// Remove anything that could cause ByteString issues (chars > U+00FF)
function clean(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[^\x00-\xFF]/g, " ").replace(/\s+/g, " ").trim();
}

// Safe JSON stringify — escapes U+2028/U+2029
function safeStringify(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Rate limit: max 5 registrations per IP per hour
async function checkRegistrationRateLimit(ip: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin()
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("role", "registration")
      .gte("attempted_at", since);
    return (count ?? 0) < 5;
  } catch { return true; }
}

async function recordRegistrationAttempt(ip: string) {
  try {
    await supabaseAdmin().from("login_attempts").insert({
      ip, role: "registration", success: true,
    });
  } catch {}
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp       = req.nextUrl.searchParams;
  const page     = parseInt(sp.get("page") || "0");
  const perPage  = Math.min(parseInt(sp.get("per_page") || "50"), 200);
  const q        = sp.get("q") || "";
  const eventId  = sp.get("event_id");
  const inactive = sp.get("inactive") === "1";

  const db = supabaseAdmin();
  let query = db.from("customers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(page * perPage, (page + 1) * perPage - 1);

  // Filter active vs inactive
  try {
    if (inactive) {
      query = query.not("deleted_at", "is", null);
    } else {
      query = query.is("deleted_at", null);
    }
  } catch {}
  if (q) query = query.or(`name.ilike.%${q}%,cpf.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ customers: data, total: count ?? 0, page, perPage });
}

export async function POST(req: NextRequest) {
  // ── Rate limiting ───────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRegistrationRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitos cadastros realizados. Tente novamente em 1 hora." },
      { status: 429 }
    );
  }

  // ── Parse body ──────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("text/plain")) {
      const b64     = await req.text();
      const decoded = Buffer.from(b64, "base64").toString("utf-8");
      body = JSON.parse(decoded);
    } else {
      const raw = (await req.text())
        .replace(/[\u2028\u2029]/g, " ")
        .replace(/[\u200B-\u200F\uFEFF]/g, "");
      body = JSON.parse(raw);
    }
  } catch (e) {
    return NextResponse.json({ error: `Dados inválidos: ${String(e)}` }, { status: 400 });
  }

  if (!body.lgpd_consent) {
    return NextResponse.json({ error: "Consentimento LGPD obrigatório" }, { status: 400 });
  }

  const cpfNum = cpfDigits(clean(body.cpf));

  // ── Check duplicate CPF ─────────────────────────────────────────
  if (!isTestCPF(cpfNum)) {
    try {
      const db = supabaseAdmin();
      const { data: existing } = await db
        .from("customers").select("id, deleted_at").eq("cpf", cpfNum).maybeSingle();
      if (existing && !existing.deleted_at) {
        return NextResponse.json({ error: "CPF já cadastrado no sistema." }, { status: 409 });
      }
    } catch {}
  }

  // ── Build payload ───────────────────────────────────────────────
  const payload: Record<string, unknown> = {
    name:       clean(body.name),
    phone:      clean(body.phone),
    cpf:        cpfNum,   // always store as digits only
    email:      clean(body.email),
    birth_date: String(body.birth || "").replace(/[^0-9\-]/g, "") || null,
    instagram:  clean(body.instagram) || null,
    event_id:   body.event_id   || null,
    event_name: clean(body.event_name) || null,
    lgpd_consent:         true,
    lgpd_consent_at:      new Date().toISOString(),
    marketing_consent:    !!body.marketing_consent,
    marketing_consent_at: body.marketing_consent ? new Date().toISOString() : null,
  };

  // ── Insert via direct REST call ─────────────────────────────────
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/[^\x21-\x7E]/g, "").trim();
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/[^\x21-\x7E]/g, "").trim();

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/customers`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json; charset=utf-8",
        "apikey":        supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Prefer":        "return=minimal",
      },
      body: safeStringify(payload),
    });

    if (r.ok) {
      await recordRegistrationAttempt(ip);
      return NextResponse.json({ ok: true });
    }

    const errText = await r.text();

    // Handle duplicate key gracefully
    if (errText.includes("23505") || errText.includes("duplicate key")) {
      return NextResponse.json({ error: "CPF já cadastrado no sistema." }, { status: 409 });
    }

    // Retry without LGPD fields if migration_v2 not run yet
    if (errText.includes("column") || errText.includes("42703")) {
      const basePayload = {
        name: payload.name, phone: payload.phone, cpf: payload.cpf,
        email: payload.email, birth_date: payload.birth_date,
        instagram: payload.instagram,
      };
      const r2 = await fetch(`${supabaseUrl}/rest/v1/customers`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json; charset=utf-8",
          "apikey":        supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Prefer":        "return=minimal",
        },
        body: safeStringify(basePayload),
      });
      if (r2.ok) {
        await recordRegistrationAttempt(ip);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "Erro ao cadastrar. Tente novamente." }, { status: 500 });
    }

    return NextResponse.json({ error: "Erro ao cadastrar. Tente novamente." }, { status: 500 });

  } catch (e) {
    return NextResponse.json({ error: "Erro de conexão. Tente novamente." }, { status: 500 });
  }
}
