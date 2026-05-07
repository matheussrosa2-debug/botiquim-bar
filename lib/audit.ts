import { supabaseAdmin } from "./supabase";
import { SessionUser } from "./auth";

type AuditAction =
  | "login_failed" | "login_success" | "logout"
  | "create_user" | "update_user" | "deactivate_user"
  | "create_prize" | "update_prize" | "delete_prize"
  | "create_event" | "update_event" | "delete_event"
  | "redeem_code" | "spin_wheel"
  | "export_data"
  | "update_config" | "update_whatsapp"
  | "delete_customer" | "gdpr_delete" | "update_customer" | "restore_customer"
  | "send_campaign";

export async function audit(params: {
  action: AuditAction;
  entity?: string;
  entity_id?: string;
  session?: SessionUser | null;
  ip?: string;
  detail?: Record<string, unknown>;
}) {
  try {
    await supabaseAdmin().from("audit_log").insert({
      action:    params.action,
      entity:    params.entity    || null,
      entity_id: params.entity_id || null,
      user_id:   params.session?.userId   || null,
      user_name: params.session?.userName || null,
      user_role: params.session?.role     || null,
      ip:        params.ip     || null,
      detail:    params.detail || null,
    });
  } catch {
    // Audit failure should never break the main flow
  }
}
