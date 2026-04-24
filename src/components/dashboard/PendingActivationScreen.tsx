import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  CheckCircle2, MessageCircle, Copy, Check, Mail, Clock,
  LogOut, RefreshCcw, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  ADMIN_SUPPORT_EMAIL,
  buildActivationMailtoUrl,
  buildActivationMessage,
  buildActivationWhatsAppUrl,
} from "@/lib/admin-contact";

/**
 * Telemetria leve via audit_logs — não usamos funnel-telemetry porque os
 * eventos do paywall têm enum tipado e estes são específicos da ativação.
 */
function logActivationEvent(action: string, metadata: Record<string, unknown> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  void (supabase as any)
    .from("audit_logs")
    .insert({ action, resource: "profiles", result: "info", metadata })
    .then(({ error }: { error: { message?: string } | null }) => {
      if (error) console.warn("[pending-activation] audit log failed:", error.message);
    });
}

/**
 * Tela exibida quando o pagamento foi aprovado mas a loja ainda não foi
 * ativada manualmente pela equipe (subscription_status = "pending_activation").
 *
 * O cliente clica num botão verde que abre o WhatsApp dele já com a mensagem
 * pronta para o número do admin (ADMIN_WHATSAPP_NUMBER).
 */
export default function PendingActivationScreen() {
  const navigate = useNavigate();
  const { user, profile, signOut, refetchProfile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);

  const data = useMemo(
    () => ({
      fullName: profile?.full_name,
      storeName: profile?.company_name,
      email: user?.email,
      plan: profile?.plan,
      paidAt: new Date(),
    }),
    [profile, user],
  );

  const waUrl = useMemo(() => buildActivationWhatsAppUrl(data), [data]);
  const mailUrl = useMemo(() => buildActivationMailtoUrl(data), [data]);
  const messageText = useMemo(() => buildActivationMessage(data), [data]);

  // O profile traz o estado real (activation_message_sent_at vem da migration).
  const messageSent = Boolean(
    (profile as unknown as { activation_message_sent_at?: string | null } | null)
      ?.activation_message_sent_at,
  );

  async function markAsSent(eventName: "activation_message_clicked" | "activation_message_marked_sent") {
    logActivationEvent(eventName, { plan: profile?.plan ?? null });
    if (messageSent) return;
    setMarking(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("mark_activation_message_sent");
      if (error) {
        console.warn("[pending-activation] mark_activation_message_sent failed:", error.message);
      } else {
        await refetchProfile();
      }
    } finally {
      setMarking(false);
    }
  }

  function handleWhatsAppClick() {
    void markAsSent("activation_message_clicked");
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      toast.success("Mensagem copiada — cole no WhatsApp.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }

  async function handleAlreadySent() {
    await markAsSent("activation_message_marked_sent");
    toast.success("Anotado! Avisamos você por e-mail assim que liberarmos.");
  }

  async function handleSignOut() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
            <Zap className="h-6 w-6 text-primary-foreground fill-primary-foreground" />
          </div>
          <span className="font-black text-lg tracking-tighter">LTV BOOST</span>
        </div>

        {/* Status badge */}
        <div className="flex justify-center">
          <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 gap-1.5 px-3 py-1 text-[11px] font-black uppercase tracking-widest">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pagamento confirmado
          </Badge>
        </div>

        {/* Main card */}
        <div className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-6 md:p-10 space-y-6 shadow-2xl">
          <div className="text-center space-y-3">
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">
              Falta um último passo para ativar sua loja
            </h1>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Para configurarmos a <strong>API oficial do WhatsApp</strong> da sua loja,
              envie uma mensagem para nossa equipe. Liberamos seu acesso em até 24h
              úteis após o pedido.
            </p>
          </div>

          {/* Order summary */}
          <div className="rounded-2xl bg-muted/30 border border-border/40 p-5 space-y-2.5 text-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/70 mb-3">
              Resumo do pedido
            </p>
            <Row label="Nome" value={profile?.full_name ?? "—"} />
            <Row label="Loja" value={profile?.company_name ?? "—"} />
            <Row label="E-mail" value={user?.email ?? "—"} />
            <Row
              label="Plano"
              value={
                <span className="font-black uppercase">
                  {profile?.plan ?? "—"}
                </span>
              }
            />
          </div>

          {/* CTA WhatsApp */}
          {!messageSent ? (
            <Button
              onClick={handleWhatsAppClick}
              size="lg"
              className="w-full h-14 text-base font-black rounded-2xl gap-2 bg-[#25D366] hover:bg-[#1fb858] text-white shadow-lg shadow-[#25D366]/30"
            >
              <MessageCircle className="w-5 h-5" />
              Solicitar ativação no WhatsApp
            </Button>
          ) : (
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-5 text-center space-y-2">
              <div className="flex items-center justify-center gap-2 text-emerald-500 font-black text-sm uppercase tracking-widest">
                <CheckCircle2 className="w-5 h-5" />
                Mensagem enviada
              </div>
              <p className="text-sm text-muted-foreground">
                Nossa equipe está configurando sua API oficial do WhatsApp.
                Você receberá um e-mail assim que sua loja for liberada
                (geralmente em até 24h úteis).
              </p>
            </div>
          )}

          {/* Secondary actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-10 font-bold gap-2"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copiado" : "Copiar mensagem"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAlreadySent}
              disabled={marking || messageSent}
              className="h-10 font-bold gap-2"
            >
              <Check className="w-4 h-4" />
              Já enviei
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="h-10 font-bold gap-2"
            >
              <a href={mailUrl}>
                <Mail className="w-4 h-4" />
                Falar por e-mail
              </a>
            </Button>
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground/80 pt-2">
            <Clock className="w-3.5 h-3.5" />
            Tempo médio de ativação: <strong className="text-foreground">até 24h úteis</strong>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => refetchProfile()}
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Já fui liberado? Atualizar
          </button>
          <span className="text-muted-foreground/40">·</span>
          <Link to="/dashboard/billing" className="hover:text-foreground transition-colors">
            Ver minha fatura
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <Link to="/dashboard/configuracoes" className="hover:text-foreground transition-colors">
            Configurações da conta
          </Link>
          <span className="text-muted-foreground/40">·</span>
          <a href={`mailto:${ADMIN_SUPPORT_EMAIL}`} className="hover:text-foreground transition-colors">
            {ADMIN_SUPPORT_EMAIL}
          </a>
          <span className="text-muted-foreground/40">·</span>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 hover:text-red-500 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-bold text-foreground truncate text-right">{value}</span>
    </div>
  );
}