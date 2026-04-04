// supabase/functions/flow-engine/index.ts
// Deno Edge Function — executes conversation flows for WhatsApp.
//
// Called internally by whatsapp-webhook when an inbound message arrives.
// Also callable for manual flow triggers.
//
// POST /functions/v1/flow-engine
// Body: { user_id, contact_id, message_text, phone, trigger_type? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

type FlowStep = {
  id: string;
  flow_id: string;
  step_order: number;
  type: string;
  config: Record<string, unknown>;
};

type FlowSession = {
  id: string;
  flow_id: string;
  contact_id: string;
  user_id: string;
  current_step_order: number;
  status: string;
  variables: Record<string, unknown>;
  last_reply: string | null;
};

async function sendWhatsAppMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  phone: string,
  text: string,
  buttons?: string[],
): Promise<string | null> {
  const { data: conn } = await supabase
    .from("whatsapp_connections")
    .select("evolution_api_url, evolution_api_key, instance_name")
    .eq("user_id", userId)
    .eq("status", "connected")
    .maybeSingle();

  if (!conn) return null;

  const normalizedPhone = phone.replace(/\D/g, "");
  const fullPhone = normalizedPhone.startsWith("55") ? normalizedPhone : `55${normalizedPhone}`;

  try {
    let body: Record<string, unknown>;

    if (buttons && buttons.length > 0) {
      // Interactive button message
      body = {
        number: `${fullPhone}@s.whatsapp.net`,
        options: { delay: 1000 },
        buttonMessage: {
          title: text,
          buttons: buttons.slice(0, 3).map((b, i) => ({
            buttonId: `btn_${i}`,
            buttonText: { displayText: b },
            type: 1,
          })),
          footerText: "",
        },
      };
    } else {
      body = {
        number: `${fullPhone}@s.whatsapp.net`,
        options: { delay: 1000 },
        textMessage: { text },
      };
    }

    const res = await fetch(
      `${conn.evolution_api_url}/message/sendText/${conn.instance_name}`,
      {
        method: "POST",
        headers: { "apikey": conn.evolution_api_key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    const data = await res.json() as { key?: { id?: string } };
    return data?.key?.id ?? null;
  } catch (err) {
    console.error("Failed to send WhatsApp message:", err);
    return null;
  }
}

function resolveVariables(text: string, variables: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => String(variables[key] ?? `{{${key}}}`));
}

async function executeStep(
  supabase: ReturnType<typeof createClient>,
  session: FlowSession,
  step: FlowStep,
  phone: string,
  inboundText?: string,
): Promise<{ advance: boolean; nextStepOrder?: number; complete?: boolean }> {
  const vars = session.variables;

  switch (step.type) {
    case "send_text": {
      const text = resolveVariables(String(step.config.text ?? ""), vars);
      await sendWhatsAppMessage(supabase, session.user_id, phone, text);
      return { advance: true };
    }

    case "send_buttons": {
      const text = resolveVariables(String(step.config.text ?? ""), vars);
      const buttons = (step.config.buttons as string[] | undefined) ?? [];
      await sendWhatsAppMessage(supabase, session.user_id, phone, text, buttons);
      // Pause and wait for reply
      await supabase.from("flow_sessions").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", session.id);
      return { advance: false };
    }

    case "wait_reply": {
      if (!inboundText) {
        // No reply yet — pause
        await supabase.from("flow_sessions").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", session.id);
        return { advance: false };
      }
      // Got a reply — store and advance
      await supabase.from("flow_sessions").update({
        last_reply: inboundText,
        status: "active",
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);
      return { advance: true };
    }

    case "branch": {
      const conditions = (step.config.conditions as { contains?: string; default?: boolean; next: number }[]) ?? [];
      const reply = (inboundText ?? session.last_reply ?? "").toLowerCase();

      for (const cond of conditions) {
        if (cond.default) return { advance: false, nextStepOrder: cond.next };
        if (cond.contains && reply.includes(cond.contains.toLowerCase())) {
          return { advance: false, nextStepOrder: cond.next };
        }
      }
      return { advance: true };
    }

    case "delay": {
      // Delays are handled at the edge by checking session updated_at
      const delayHours = Number(step.config.hours ?? 1);
      const elapsed = (Date.now() - new Date(session.updated_at ?? session.started_at).getTime()) / 3600000;
      if (elapsed < delayHours) {
        // Not yet — keep waiting
        return { advance: false };
      }
      return { advance: true };
    }

    case "tag_contact": {
      const tag = String(step.config.tag ?? "");
      if (tag) {
        const { data: contact } = await supabase.from("contacts").select("tags").eq("id", session.contact_id).maybeSingle();
        const tags: string[] = (contact?.tags as string[] | null) ?? [];
        if (!tags.includes(tag)) {
          await supabase.from("contacts").update({ tags: [...tags, tag] }).eq("id", session.contact_id);
        }
      }
      return { advance: true };
    }

    case "ai_agent": {
      if (!inboundText) {
        await supabase.from("flow_sessions").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", session.id);
        return { advance: false };
      }

      // 1. Get user profile (knowledge base)
      const { data: profile } = await supabase
        .from("profiles")
        .select("knowledge_base, ai_model, company_name")
        .eq("id", session.user_id)
        .maybeSingle();

      const kb = profile?.knowledge_base ?? "Nenhuma informação adicional disponível.";
      const model = profile?.ai_model ?? "gpt-4o-mini";
      const company = profile?.company_name ?? "nossa loja";

      // 2. Call OpenAI
      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) {
        await sendWhatsAppMessage(supabase, session.user_id, phone, "Desculpe, estou com problemas técnicos agora. Pode repetir?");
        return { advance: false };
      }

      const systemPrompt = `Você é um assistente de atendimento da ${company}. 
Use a Base de Conhecimento abaixo para responder às perguntas dos clientes no WhatsApp.
Seja gentil, direto e use emojis. Se não souber a resposta, peça para o cliente aguardar um atendente humano.

Base de Conhecimento:
${kb}`;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: inboundText },
          ],
        }),
      });

      const aiData = await res.json();
      const reply = aiData.choices?.[0]?.message?.content ?? "Não consegui processar sua dúvida. Um atendente humano irá te ajudar em breve.";

      await sendWhatsAppMessage(supabase, session.user_id, phone, reply);
      
      // Keep session in ai_agent mode for subsequent questions or advance if configured
      const autoAdvance = !!step.config.auto_advance;
      if (autoAdvance) return { advance: true };
      
      await supabase.from("flow_sessions").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", session.id);
      return { advance: false };
    }

    case "send_nps": {
      const question = String(step.config.question ?? "De 0 a 10, quanto você recomendaria nossa loja para um amigo? Responda com um número.");
      await sendWhatsAppMessage(supabase, session.user_id, phone, question);
      // Create pending NPS response
      await supabase.from("nps_responses").insert({
        user_id: session.user_id,
        contact_id: session.contact_id,
        sent_at: new Date().toISOString(),
      });
      await supabase.from("flow_sessions").update({ status: "waiting_reply", updated_at: new Date().toISOString() }).eq("id", session.id);
      return { advance: false };
    }

    default:
      return { advance: true };
  }
}

async function runFlow(
  supabase: ReturnType<typeof createClient>,
  session: FlowSession,
  phone: string,
  inboundText?: string,
): Promise<void> {
  // Get all steps for this flow
  const { data: steps } = await supabase
    .from("flow_steps")
    .select("*")
    .eq("flow_id", session.flow_id)
    .order("step_order", { ascending: true });

  if (!steps?.length) return;

  let currentOrder = session.current_step_order;

  // Process steps sequentially until we need to pause
  for (let i = 0; i < 20; i++) { // max 20 steps per trigger to prevent infinite loops
    const step = steps.find((s) => s.step_order === currentOrder);
    if (!step) {
      // No more steps — flow complete
      await supabase.from("flow_sessions").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);

      // Increment completions counter
      await supabase.from("conversation_flows")
        .update({ completions_count: supabase.rpc("completions_count", {}) })
        .eq("id", session.flow_id);

      // Use raw increment
      await supabase.rpc("exec_sql" as never, {
        sql: `UPDATE conversation_flows SET completions_count = completions_count + 1 WHERE id = '${session.flow_id}'`,
      }).catch(() => {
        // RPC may not exist — ignore, counter update is non-critical
      });
      return;
    }

    const result = await executeStep(supabase, session, step as FlowStep, phone, inboundText);

    // After processing the first step with inbound text, subsequent steps use undefined
    inboundText = undefined;

    if (result.nextStepOrder !== undefined) {
      // Branch: jump to specific step
      currentOrder = result.nextStepOrder;
      await supabase.from("flow_sessions").update({
        current_step_order: currentOrder,
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);
    } else if (result.advance) {
      currentOrder++;
      await supabase.from("flow_sessions").update({
        current_step_order: currentOrder,
        updated_at: new Date().toISOString(),
      }).eq("id", session.id);
    } else {
      // Paused — stop processing
      break;
    }
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const body = await req.json() as {
      user_id: string;
      contact_id: string;
      message_text?: string;
      phone: string;
      trigger_type?: string;
    };

    const { user_id, contact_id, message_text, phone, trigger_type } = body;
    if (!user_id || !contact_id || !phone) {
      return new Response(JSON.stringify({ error: "user_id, contact_id, phone required" }), { status: 400, headers: CORS });
    }

    // 1. Check for an existing active/waiting session for this contact
    const { data: existingSession } = await supabase
      .from("flow_sessions")
      .select("*")
      .eq("user_id", user_id)
      .eq("contact_id", contact_id)
      .in("status", ["active", "waiting_reply"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      // Resume existing session with this inbound message
      if (existingSession.status === "waiting_reply" && message_text) {
        await supabase.from("flow_sessions").update({
          status: "active",
          last_reply: message_text,
          updated_at: new Date().toISOString(),
        }).eq("id", existingSession.id);

        // Check if this is an NPS reply (score 0-10)
        const score = parseInt(message_text.trim(), 10);
        if (!isNaN(score) && score >= 0 && score <= 10) {
          // Update pending NPS response
          await supabase
            .from("nps_responses")
            .update({ score, responded_at: new Date().toISOString() })
            .eq("user_id", user_id)
            .eq("contact_id", contact_id)
            .is("responded_at", null)
            .order("sent_at", { ascending: false })
            .limit(1);
        }

        await runFlow(supabase, { ...existingSession, status: "active", last_reply: message_text } as FlowSession, phone, message_text);
      }
      return new Response(JSON.stringify({ matched: true, session_id: existingSession.id }), { headers: CORS });
    }

    // 2. No active session — try to match a flow trigger
    if (!message_text && trigger_type !== "post_purchase" && trigger_type !== "cart_abandoned") {
      return new Response(JSON.stringify({ matched: false }), { headers: CORS });
    }

    // Check keyword trigger
    let flowId: string | null = null;

    if (trigger_type) {
      const { data: flow } = await supabase
        .from("conversation_flows")
        .select("id")
        .eq("user_id", user_id)
        .eq("is_active", true)
        .eq("trigger_type", trigger_type)
        .limit(1)
        .maybeSingle();
      flowId = flow?.id ?? null;
    }

    if (!flowId && message_text) {
      // Check keyword triggers
      const { data: flows } = await supabase
        .from("conversation_flows")
        .select("id, trigger_value")
        .eq("user_id", user_id)
        .eq("is_active", true)
        .eq("trigger_type", "keyword");

      for (const f of flows ?? []) {
        const kw = (f.trigger_value as string | null)?.toLowerCase() ?? "";
        if (kw && message_text.toLowerCase().includes(kw)) {
          flowId = f.id;
          break;
        }
      }

      // Check first_message trigger (contact's first ever inbound message)
      if (!flowId) {
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id",
            (await supabase
              .from("conversations")
              .select("id")
              .eq("contact_id", contact_id)
              .maybeSingle()
            ).data?.id ?? ""
          )
          .eq("direction", "inbound");

        if ((count ?? 0) <= 1) {
          const { data: firstMsgFlow } = await supabase
            .from("conversation_flows")
            .select("id")
            .eq("user_id", user_id)
            .eq("is_active", true)
            .eq("trigger_type", "first_message")
            .maybeSingle();
          flowId = firstMsgFlow?.id ?? null;
        }
      }
    }

    if (!flowId) {
      return new Response(JSON.stringify({ matched: false }), { headers: CORS });
    }

    // 3. Create new session and start the flow
    const { data: contact } = await supabase.from("contacts").select("name").eq("id", contact_id).maybeSingle();

    const { data: newSession } = await supabase
      .from("flow_sessions")
      .insert({
        flow_id: flowId,
        contact_id,
        user_id,
        current_step_order: 1,
        status: "active",
        variables: { nome: contact?.name ?? phone, phone },
      })
      .select("*")
      .single();

    if (!newSession) {
      return new Response(JSON.stringify({ matched: true, error: "Failed to create session" }), { headers: CORS });
    }

    // Increment sessions counter
    await supabase
      .from("conversation_flows")
      .update({ sessions_count: newSession.sessions_count ?? 0 })
      .eq("id", flowId);

    await runFlow(supabase, newSession as FlowSession, phone, message_text);

    return new Response(JSON.stringify({ matched: true, session_id: newSession.id }), { headers: CORS });
  } catch (err) {
    console.error("flow-engine error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }),
      { status: 500, headers: CORS },
    );
  }
});
