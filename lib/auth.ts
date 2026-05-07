import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { supabaseAdmin } from "./supabase";
import crypto from "crypto";

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-dev-secret");
export type Role = "manager" | "employee";

export type SessionUser = {
  role: Role;
  userId: string | null;
  userName: string;
};

export function hashPassword(password: string): string {
  const salt = process.env.JWT_SECRET || "default-salt";
  return crypto.pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex");
}

export async function signToken(payload: SessionUser): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("12h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      role:     payload.role as Role,
      userId:   (payload.userId as string) || null,
      userName: (payload.userName as string) || "Usuário",
    };
  } catch { return null; }
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("btq_session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function getConfig(key: string): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin().from("config").select("value").eq("key", key).single();
    return data?.value ?? null;
  } catch { return null; }
}

export async function setConfig(key: string, value: string) {
  try { await supabaseAdmin().from("config").upsert({ key, value }); } catch {}
}

export async function authenticateUser(username: string, password: string): Promise<SessionUser | null> {
  const db = supabaseAdmin();

  try {
    const { data: user } = await db
      .from("users")
      .select("id, name, role, password_hash, active")
      .eq("username", username.toLowerCase().trim())
      .eq("active", true)
      .maybeSingle();

    if (user) {
      const hash = hashPassword(password);
      if (hash === user.password_hash) {
        await db.from("users").update({ last_seen: new Date().toISOString() }).eq("id", user.id);
        return { role: user.role as Role, userId: user.id, userName: user.name };
      }
      return null;
    }
  } catch {}

  // Fallback: legacy global passwords
  const lUser = username.toLowerCase().trim();
  if (lUser === "gestor" || lUser === "manager") {
    const stored = await getConfig("manager_password");
    const fallback = process.env.INITIAL_MANAGER_PASSWORD || "gestor123";
    if (password === (stored ?? fallback)) {
      return { role: "manager", userId: null, userName: "Gestor" };
    }
  }
  if (lUser === "funcionario" || lUser === "employee" || lUser === "func") {
    const stored = await getConfig("employee_password");
    const fallback = process.env.INITIAL_EMPLOYEE_PASSWORD || "func123";
    if (password === (stored ?? fallback)) {
      return { role: "employee", userId: null, userName: "Funcionário" };
    }
  }

  return null;
}

export async function checkRateLimit(ip: string, username: string): Promise<boolean> {
  try {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin()
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip).eq("role", username).eq("success", false)
      .gte("attempted_at", since);
    return (count ?? 0) < 5;
  } catch { return true; }
}

export async function recordLoginAttempt(ip: string, username: string, success: boolean) {
  try {
    await supabaseAdmin().from("login_attempts").insert({ ip, role: username, success });
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await supabaseAdmin().from("login_attempts").delete().lt("attempted_at", cutoff);
  } catch {}
}

// Alert manager via WhatsApp after 3 failed login attempts
export async function checkAndAlertSuspiciousLogin(ip: string, username: string) {
  try {
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin()
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip).eq("success", false)
      .gte("attempted_at", since);

    const failCount = count ?? 0;

    // Alert at exactly 3 attempts (avoid sending multiple alerts)
    if (failCount === 3) {
      const { data: cfg } = await supabaseAdmin()
        .from("whatsapp_config").select("*").limit(1).maybeSingle();
      const { data: managers } = await supabaseAdmin()
        .from("users").select("name").eq("role", "manager").eq("active", true).limit(3);

      if (!cfg?.enabled || !cfg?.instance_id || !cfg?.token) return;

      const { decrypt } = await import("./crypto");
      const token       = decrypt(cfg.token);
      const clientToken = cfg.client_token ? decrypt(cfg.client_token) : "";
      const barName     = await getConfig("bar_name") || "Botiquim Bar";
      const now         = new Date().toLocaleString("pt-BR");

      const message = `⚠️ *Alerta de segurança — ${barName}*\n\n` +
        `3 tentativas de login malsucedidas foram detectadas.\n\n` +
        `👤 Usuário: ${username}\n` +
        `🌐 IP: ${ip}\n` +
        `🕐 Horário: ${now}\n\n` +
        `Se não foi você, verifique o acesso imediatamente.`;

      // Send to manager phone from config
      const { data: configPhone } = await supabaseAdmin()
        .from("config").select("value").eq("key", "alert_phone").maybeSingle();

      const phone = configPhone?.value;
      if (!phone) return;

      const url = `https://api.z-api.io/instances/${cfg.instance_id}/token/${token}/send-text`;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (clientToken) headers["Client-Token"] = clientToken;

      await fetch(url, {
        method: "POST", headers,
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), message }),
      });
    }
  } catch {}
}
