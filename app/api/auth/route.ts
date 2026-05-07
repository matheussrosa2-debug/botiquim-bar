import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser, signToken, getSession,
  checkRateLimit, recordLoginAttempt, checkAndAlertSuspiciousLogin,
} from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ error: "Usuário e senha obrigatórios" }, { status: 400 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = await checkRateLimit(ip, username);
  if (!allowed) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos." }, { status: 429 });
  }

  const user = await authenticateUser(username, password);
  await recordLoginAttempt(ip, username, !!user);

  if (!user) {
    // Check if we should send alert (3 failed attempts)
    checkAndAlertSuspiciousLogin(ip, username).catch(() => {});
    return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
  }

  // Record session if individual user
  if (user.userId) {
    try {
      await supabaseAdmin().from("user_sessions").insert({ user_id: user.userId, ip });
    } catch {}
  }

  await audit({ action: "login_success", session: user, ip });

  const token = await signToken(user);
  const res = NextResponse.json({ ok: true, role: user.role, userName: user.userName });
  res.cookies.set("btq_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 12,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const session = await getSession();
  await audit({ action: "logout", session });
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("btq_session");
  return res;
}

export async function GET() {
  const session = await getSession();
  return NextResponse.json(session || { role: null, userId: null, userName: null });
}
