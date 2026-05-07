import { supabaseAdmin } from "./supabase";
import { decrypt, encrypt } from "./crypto";

type WaConfig = { instance_id: string; token: string; client_token: string; enabled: boolean } | null;
type TemplateType = "welcome" | "birthday";

export async function getWaConfig(): Promise<WaConfig> {
  const db = supabaseAdmin();
  const { data } = await db.from("whatsapp_config").select("*").limit(1).maybeSingle();
  if (!data?.instance_id || !data?.token) return null;
  return {
    ...data,
    token:        decrypt(data.token),
    client_token: data.client_token ? decrypt(data.client_token) : "",
  } as WaConfig;
}

export async function getTemplate(type: TemplateType): Promise<string | null> {
  const db = supabaseAdmin();
  const { data } = await db.from("whatsapp_templates")
    .select("body, enabled").eq("type", type).maybeSingle();
  if (!data?.enabled) return null;
  return data.body;
}

export function buildMessage(template: string, vars: Record<string, string>): string {
  let msg = template;
  for (const [k, v] of Object.entries(vars)) {
    msg = msg.replaceAll(`{${k}}`, v);
  }
  return msg;
}

function cleanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export async function sendWhatsApp(
  phone: string,
  message: string,
  config: NonNullable<WaConfig>
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}/send-text`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Client-Token is required by Z-API when security token is enabled
    if (config.client_token) headers["Client-Token"] = config.client_token;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone: cleanPhone(phone), message }),
    });
    if (!res.ok) return { ok: false, error: await res.text() };
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: String(e) };
  }
}

export async function logMessage(params: {
  customer_cpf: string; customer_name: string; phone: string;
  type: string; status: string; message_text: string; error?: string;
}) {
  try {
    await supabaseAdmin().from("whatsapp_messages").insert({
      ...params,
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
    });
  } catch {}
}

export async function sendWelcome(customer: {
  cpf: string; name: string; phone: string; prize_name: string;
  prize_code: string; expires_at: string; bar_name?: string;
}) {
  const [config, template] = await Promise.all([getWaConfig(), getTemplate("welcome")]);
  if (!config?.enabled || !template) return;

  const expiresAt = new Date(customer.expires_at);
  const message = buildMessage(template, {
    nome:          customer.name,
    primeiro_nome: customer.name.split(" ")[0],
    premio:        customer.prize_name,
    codigo:        customer.prize_code,
    validade:      expiresAt.toLocaleString("pt-BR"),
    bar_nome:      customer.bar_name || "Botiquim Bar",
  });

  const result = await sendWhatsApp(customer.phone, message, config);
  await logMessage({
    customer_cpf:  customer.cpf,
    customer_name: customer.name,
    phone:         customer.phone,
    type:          "welcome",
    status:        result.ok ? "sent" : "failed",
    message_text:  message,
    error:         result.error,
  });

  if (result.ok) {
    try {
      await supabaseAdmin().from("customers").update({
        welcome_sent: true, welcome_sent_at: new Date().toISOString(),
      }).eq("cpf", customer.cpf);
    } catch {}
  }
}
