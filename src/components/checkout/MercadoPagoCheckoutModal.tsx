import { useEffect, useState, useRef } from "react";
import { Loader2, X, Copy, Check, AlertCircle, ExternalLink, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { PLANS } from "@/lib/pricing-constants";
import { trackFunnelEvent } from "@/lib/funnel-telemetry";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { trackPixel } from "@/lib/meta-pixel";

const ANNUAL_DISCOUNT = 0.2;
const monthlyOf = (k: PlanKey) => PLANS[k].base;
const annualOf = (k: PlanKey) => Math.round(PLANS[k].base * (1 - ANNUAL_DISCOUNT));

export type PlanKey = "starter" | "growth" | "scale";
export type BillingCycle = "monthly" | "annual";

export interface CheckoutRequest {
  planKey: PlanKey;
  billingCycle: BillingCycle;
  source: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request: CheckoutRequest | null;
}

type Phase =
  | { kind: "loading-sdk" }
  | { kind: "sdk-failed" }
  | { kind: "ready" }
  | { kind: "processing" }
  | { kind: "approved"; paymentId: number }
  | { kind: "pending-pix"; paymentId: number; qrCode: string; qrCodeBase64: string }
  | { kind: "pending-boleto"; paymentId: number; ticketUrl: string }
  | { kind: "rejected"; message: string };

let mpInitPromise: Promise<boolean> | null = null;

async function loadMpSdk(): Promise<boolean> {
  if (mpInitPromise) return mpInitPromise;
  mpInitPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke<{ public_key: string }>(
        "mercadopago-public-key",
      );
      if (error || !data?.public_key) return false;
      const mod = await import("@mercadopago/sdk-react");
      mod.initMercadoPago(data.public_key, { locale: "pt-BR" });
      return true;
    } catch (e) {
      console.error("[mp] SDK init failed", e);
      return false;
    }
  })();
  return mpInitPromise;
}

export default function MercadoPagoCheckoutModal({ open, onOpenChange, request }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>({ kind: "loading-sdk" });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [PaymentBrick, setPaymentBrick] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<number | null>(null);

  const amount = request
    ? request.billingCycle === "annual"
      ? annualOf(request.planKey)
      : monthlyOf(request.planKey)
    : 0;

  // Boot SDK on open
  useEffect(() => {
    if (!open || !request) return;
    setPhase({ kind: "loading-sdk" });
    setCopied(false);
    let cancelled = false;
    (async () => {
      const ok = await loadMpSdk();
      if (cancelled) return;
      if (!ok) {
        setPhase({ kind: "sdk-failed" });
        return;
      }
      const mod = await import("@mercadopago/sdk-react");
      setPaymentBrick(() => mod.Payment);
      setPhase({ kind: "ready" });
      void trackFunnelEvent({
        event: "checkout_started",
        selectedPlan: request.planKey,
        metadata: { source: request.source, billing_cycle: request.billingCycle, ui: "brick" },
      });
      // Meta Pixel — user reached the checkout step.
      trackPixel("InitiateCheckout", {
        content_name: PLANS[request.planKey].name,
        content_category: "subscription",
        content_ids: [request.planKey],
        currency: "BRL",
        value: request.billingCycle === "annual"
          ? annualOf(request.planKey)
          : monthlyOf(request.planKey),
        num_items: 1,
      });
    })();
    return () => { cancelled = true; };
  }, [open, request]);

  // Cleanup polling on close
  useEffect(() => {
    if (!open && pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [open]);

  const startPolling = (paymentId: number) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    let elapsed = 0;
    pollRef.current = window.setInterval(async () => {
      elapsed += 3;
      if (elapsed > 300) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        return;
      }
      try {
        const { data } = await supabase.functions.invoke<{ status: string }>(
          `mercadopago-payment-status?id=${paymentId}`,
        );
        if (data?.status === "approved") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setPhase({ kind: "approved", paymentId });
          toast.success("Pagamento confirmado!");
          // Meta Pixel — Purchase confirmed (PIX/boleto async path).
          if (request) {
            trackPixel("Purchase", {
              content_name: PLANS[request.planKey].name,
              content_ids: [request.planKey],
              content_category: "subscription",
              currency: "BRL",
              value: amount,
              num_items: 1,
            });
          }
          setTimeout(() => navigate("/dashboard?welcome=1"), 1500);
        }
      } catch { /* ignore polling errors */ }
    }, 3000);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = async (formData: any) => {
    if (!request) return;
    setPhase({ kind: "processing" });
    try {
      const { data, error } = await supabase.functions.invoke<{
        payment_id: number; status: string; status_detail: string;
        qr_code: string | null; qr_code_base64: string | null; ticket_url: string | null;
      }>("mercadopago-process-payment", {
        body: {
          plan_key: request.planKey,
          billing_cycle: request.billingCycle,
          payment_data: { ...formData, transaction_amount: amount },
        },
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Sem resposta do servidor");

      if (data.status === "approved") {
        setPhase({ kind: "approved", paymentId: data.payment_id });
        toast.success("Pagamento aprovado!");
        void trackFunnelEvent({
          event: "checkout_completed",
          selectedPlan: request.planKey,
          metadata: { payment_id: data.payment_id },
        });
        // Meta Pixel — Purchase confirmed (cartão sync path).
        trackPixel("Purchase", {
          content_name: PLANS[request.planKey].name,
          content_ids: [request.planKey],
          content_category: "subscription",
          currency: "BRL",
          value: amount,
          num_items: 1,
        });
        setTimeout(() => navigate("/dashboard?welcome=1"), 1500);
        return;
      }
      if (data.status === "pending" || data.status === "in_process") {
        if (data.qr_code) {
          setPhase({
            kind: "pending-pix",
            paymentId: data.payment_id,
            qrCode: data.qr_code,
            qrCodeBase64: data.qr_code_base64 ?? "",
          });
          startPolling(data.payment_id);
          return;
        }
        if (data.ticket_url) {
          setPhase({ kind: "pending-boleto", paymentId: data.payment_id, ticketUrl: data.ticket_url });
          return;
        }
      }
      setPhase({ kind: "rejected", message: data.status_detail ?? "Pagamento recusado" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao processar pagamento";
      setPhase({ kind: "rejected", message: msg });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onBrickError = async (error: any) => {
    console.error("[mp brick] error", error);
  };

  const fallbackToRedirect = async () => {
    if (!request) return;
    try {
      const { data, error } = await supabase.functions.invoke<{ init_point?: string; sandbox_init_point?: string }>(
        "mercadopago-create-preference",
        { body: { plan_key: request.planKey, billing_cycle: request.billingCycle } },
      );
      if (error) throw error;
      const url = data?.init_point ?? data?.sandbox_init_point;
      if (!url) throw new Error("URL de checkout não retornada");
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir checkout");
    }
  };

  const copyPix = async () => {
    if (phase.kind !== "pending-pix") return;
    await navigator.clipboard.writeText(phase.qrCode);
    setCopied(true);
    toast.success("Código PIX copiado");
    setTimeout(() => setCopied(false), 2500);
  };

  if (!request) return null;
  const planName = PLANS[request.planKey].name;
  const cycleLabel = request.billingCycle === "annual" ? "Anual" : "Mensal";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagamento — Plano {planName} ({cycleLabel})</DialogTitle>
          <DialogDescription>
            R$ {amount.toLocaleString("pt-BR")} • Cartão, PIX ou Boleto
          </DialogDescription>
        </DialogHeader>

        {phase.kind === "loading-sdk" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando checkout seguro…</p>
          </div>
        )}

        {phase.kind === "sdk-failed" && (
          <div className="space-y-4 py-4">
            <Alert>
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>
                Não foi possível carregar o checkout transparente. Você pode pagar pela página segura do Mercado Pago.
              </AlertDescription>
            </Alert>
            <Button onClick={fallbackToRedirect} className="w-full">
              <ExternalLink className="w-4 h-4 mr-2" />
              Continuar no Mercado Pago
            </Button>
          </div>
        )}

        {phase.kind === "ready" && PaymentBrick && (
          <div className="pt-2">
            <PaymentBrick
              initialization={{
                amount,
                payer: { email: user?.email ?? "" },
              }}
              customization={{
                paymentMethods: {
                  creditCard: "all",
                  bankTransfer: ["pix"],
                  ticket: ["bolbradesco"],
                  maxInstallments: 12,
                },
                visual: { style: { theme: "dark" } },
              }}
              onSubmit={async ({ formData }: { formData: unknown }) => {
                await onSubmit(formData);
              }}
              onError={onBrickError}
            />
          </div>
        )}

        {phase.kind === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processando pagamento…</p>
          </div>
        )}

        {phase.kind === "approved" && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-bold">Pagamento aprovado!</h3>
            <p className="text-sm text-muted-foreground">Redirecionando para o seu painel…</p>
          </div>
        )}

        {phase.kind === "pending-pix" && (
          <div className="space-y-4 py-2">
            <div className="text-center space-y-2">
              <p className="text-sm font-semibold">Escaneie o QR Code para pagar</p>
              <p className="text-xs text-muted-foreground">Aprovação em até 1 minuto após o pagamento.</p>
            </div>
            {phase.qrCodeBase64 && (
              <div className="flex justify-center">
                <img
                  src={`data:image/png;base64,${phase.qrCodeBase64}`}
                  alt="QR Code PIX"
                  className="w-56 h-56 rounded-lg border"
                />
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Ou copie o código PIX:</p>
              <div className="flex gap-2">
                <code className="flex-1 text-[10px] bg-muted/40 rounded p-2 truncate font-mono">
                  {phase.qrCode}
                </code>
                <Button size="sm" variant="outline" onClick={copyPix}>
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <Alert>
              <Loader2 className="w-4 h-4 animate-spin" />
              <AlertDescription className="text-xs">
                Aguardando confirmação do pagamento…
              </AlertDescription>
            </Alert>
          </div>
        )}

        {phase.kind === "pending-boleto" && (
          <div className="space-y-4 py-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-primary/15 flex items-center justify-center">
              <FileText className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold">Boleto gerado!</h3>
              <p className="text-sm text-muted-foreground">
                Compensação em 1–3 dias úteis. Você receberá um email quando aprovado.
              </p>
            </div>
            <Button asChild className="w-full">
              <a href={phase.ticketUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" /> Abrir boleto / linha digitável
              </a>
            </Button>
          </div>
        )}

        {phase.kind === "rejected" && (
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <X className="w-4 h-4" />
              <AlertDescription>
                {phase.message || "Pagamento recusado. Tente novamente ou use outro método."}
              </AlertDescription>
            </Alert>
            <Button onClick={() => setPhase({ kind: "ready" })} className="w-full">
              Tentar novamente
            </Button>
            <Button onClick={fallbackToRedirect} variant="outline" className="w-full">
              Pagar via página segura do Mercado Pago
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}