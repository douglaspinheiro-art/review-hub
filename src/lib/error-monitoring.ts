import { supabase } from "@/lib/supabase";

interface ClientErrorPayload {
  message: string;
  stack?: string;
  componentStack?: string;
  route?: string;
  userAgent?: string;
}

export async function reportClientError(payload: ClientErrorPayload): Promise<void> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id ?? null;
    if (!userId) return;

    await supabase.from("client_error_events").insert({
      user_id: userId,
      message: payload.message,
      stack: payload.stack ?? null,
      component_stack: payload.componentStack ?? null,
      route: payload.route ?? null,
      user_agent: payload.userAgent ?? null,
      created_at: new Date().toISOString(),
    } as never);
  } catch {
    // Best effort telemetry must never break UI rendering.
  }
}
