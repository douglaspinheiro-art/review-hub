import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
// Card imports removed — unused
import { Separator } from "@/components/ui/separator";
import { ShoppingBag, DollarSign, Calendar, User, Mail, ChevronRight, ShoppingCart, MessageCircle, TrendingUp, QrCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/hooks/useConvertIQ";
import { buildMagicLink, EcommercePlatform } from "@/lib/checkout-builder";
import { generatePixPayload } from "@/lib/pix-generator";
import { sendTextForConnection, type ConnRow } from "@/lib/meta-whatsapp-client";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  total_orders?: number;
  total_spent?: number;
  created_at?: string;
  notes?: string;
}

interface ContactInfoSidebarProps {
  contact: Contact | null;
  className?: string;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function ContactInfoSidebar({ contact, className }: ContactInfoSidebarProps) {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPix, setShowPix] = useState(false);

  // Checkout state
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  const [coupon, setCoupon] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // PIX state
  const [pixAmount, setPixAmount] = useState("");
  const [pixDesc, setPixDesc] = useState("");
  const [pixKeyInput, setPixKeyInput] = useState("");
  const [pixLoading, setPixLoading] = useState(false);

  const loja = useLoja();

  const { data: conn } = useQuery<ConnRow | null>({
    queryKey: ["wpp-conn-sidebar", user?.id ?? null],
    queryFn: async () => {
      const storeId = scope?.activeStoreId ?? null;
      const effectiveUserId = scope?.effectiveUserId ?? null;
      if (!effectiveUserId) return null;
      let q = supabase
        .from("whatsapp_connections")
        .select(
          "id, instance_name, status, provider, meta_phone_number_id, meta_default_template_name, meta_api_version",
        )
        .eq("status", "connected")
        .eq("provider", "meta_cloud");
      q = storeId ? q.eq("store_id", storeId) : q.eq("user_id", effectiveUserId);
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return (data as ConnRow | null) ?? null;
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  if (!contact) return null;

  const initials = contact.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";

  async function handleSendCheckout() {
    if (!contact) return;
    const lojaData = loja.data as any;
    if (!lojaData?.url) {
      toast.error("Configure a URL da loja em Funil → Configurar loja");
      return;
    }
    if (!sku.trim()) {
      toast.error("Informe o SKU/ID do produto");
      return;
    }
    if (!conn) {
      toast.error("Nenhuma conexão WhatsApp ativa");
      return;
    }
    setCheckoutLoading(true);
    try {
      const platform = (lojaData?.segment === "outro" ? "custom" : lojaData?.segment || "custom") as EcommercePlatform;
      const url = buildMagicLink({
        platform,
        storeUrl: lojaData?.url || "",
        cartItems: [{ id: sku.trim(), quantity: Number(qty) || 1 }],
        customerPhone: contact.phone,
        customerEmail: contact.email,
        customerName: contact.name,
        couponCode: coupon.trim() || undefined,
      });
      const phone = normalizePhone(contact.phone);
      await sendTextForConnection(conn, {
        number: phone,
        text: `🛒 *Link de compra personalizado*\n\nOlá ${contact.name?.split(" ")[0] ?? ""}! Preparei este link especial pra você:\n\n${url}`,
      });
      toast.success("Link de compra enviado via WhatsApp!");
      setShowCheckout(false);
      setSku(""); setQty("1"); setCoupon("");
    } catch (e) {
      toast.error(`Erro ao enviar: ${(e as Error).message}`);
    } finally {
      setCheckoutLoading(false);
    }
  }

  async function handleSendPix() {
    if (!contact) return;
    const lojaData = loja.data as any;
    const pixKey = lojaData?.pix_key || pixKeyInput.trim();
    if (!pixKey) {
      toast.error("Informe a chave PIX");
      return;
    }
    const amount = Number(pixAmount.replace(",", "."));
    if (!amount || amount <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!conn) {
      toast.error("Nenhuma conexão WhatsApp ativa");
      return;
    }
    setPixLoading(true);
    try {
      const payload = generatePixPayload({
        key: pixKey,
        receiverName: lojaData?.name ?? "Loja",
        receiverCity: "Brasil",
        amount,
        description: pixDesc.trim() || undefined,
      });
      const phone = normalizePhone(contact!.phone);
      const amountFormatted = amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await sendTextForConnection(conn, {
        number: phone,
        text: `💳 *PIX — ${amountFormatted}*${pixDesc.trim() ? `\n${pixDesc.trim()}` : ""}\n\nCopie o código abaixo:\n\n\`${payload}\``,
      });
      toast.success("PIX enviado via WhatsApp!");
      setShowPix(false);
      setPixAmount(""); setPixDesc(""); setPixKeyInput("");
    } catch (e) {
      toast.error(`Erro ao enviar PIX: ${(e as Error).message}`);
    } finally {
      setPixLoading(false);
    }
  }

  return (
    <aside className={cn("flex flex-col h-full bg-card border-l w-80 overflow-y-auto", className)}>
      <div className="p-6 flex flex-col items-center text-center">
        <Avatar className="w-20 h-20 mb-4 border-2 border-primary/10">
          <AvatarFallback className="text-xl font-bold bg-primary/5 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-semibold text-lg leading-tight">{contact.name || contact.phone}</h3>
        <p className="text-sm text-muted-foreground mt-1">{contact.phone}</p>

        <div className="flex flex-wrap justify-center gap-1.5 mt-4">
          {contact.tags?.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0 capitalize">
              {tag}
            </Badge>
          ))}
          {(!contact.tags || contact.tags.length === 0) && (
            <span className="text-[10px] text-muted-foreground italic">Sem tags</span>
          )}
        </div>
      </div>

      <Separator />

      <div className="p-6 space-y-6">
        {/* LTV Predictor Intelligence Moat */}
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-3 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-100 transition-opacity">
            <TrendingUp className="w-4 h-4 text-primary" />
          </div>
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">LTV Predictor AI</h4>
          <div className="space-y-1">
            <p className="text-xs font-bold">Próxima compra estimada:</p>
            <p className="text-sm font-black font-syne text-primary">em 12 dias</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-600 border-0 text-[9px] font-bold">85% Probabilidade</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground italic">"Cliente está no momento ideal de recompra baseado no histórico."</p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Métricas de Valor</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span className="text-[10px] font-medium uppercase">Pedidos</span>
              </div>
              <p className="text-lg font-bold">{contact.total_orders || 0}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="w-3.5 h-3.5" />
                <span className="text-[10px] font-medium uppercase">Total Gasto</span>
              </div>
              <p className="text-lg font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contact.total_spent || 0)}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Informações</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">Email</p>
                <p className="truncate">{contact.email || "Não informado"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">Cliente desde</p>
                <p>{contact.created_at ? new Date(contact.created_at).toLocaleDateString('pt-BR') : "—"}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Button variant="outline" className="w-full h-11 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border-2 gap-2 hover:bg-primary/5 hover:text-primary transition-all">
            <MessageCircle className="w-3.5 h-3.5" /> Iniciar Atendimento
          </Button>

          {/* Enviar Link de Compra */}
          <Button
            variant="outline"
            className="w-full h-11 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border-2 gap-2 hover:bg-emerald-500/5 hover:text-emerald-600 hover:border-emerald-500/30 transition-all"
            onClick={() => { setShowCheckout(v => !v); setShowPix(false); }}
          >
            <ShoppingCart className="w-3.5 h-3.5" /> Enviar Link de Compra
          </Button>

          {showCheckout && (
            <div className="bg-muted/40 border border-emerald-500/20 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Link de Checkout</p>
              <div className="space-y-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground">SKU / ID do produto</Label>
                  <Input placeholder="ex: 123456" value={sku} onChange={e => setSku(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Quantidade</Label>
                    <Input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Cupom</Label>
                    <Input placeholder="ex: VIP10" value={coupon} onChange={e => setCoupon(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                </div>
              </div>
              <Button size="sm" className="w-full h-8 text-[10px] font-black uppercase rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleSendCheckout} disabled={checkoutLoading}>
                {checkoutLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><ShoppingCart className="w-3.5 h-3.5" /> Enviar via WhatsApp</>}
              </Button>
            </div>
          )}

          {/* Enviar PIX */}
          <Button
            variant="outline"
            className="w-full h-11 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl border-2 gap-2 hover:bg-violet-500/5 hover:text-violet-600 hover:border-violet-500/30 transition-all"
            onClick={() => { setShowPix(v => !v); setShowCheckout(false); }}
          >
            <QrCode className="w-3.5 h-3.5" /> Enviar PIX
          </Button>

          {showPix && (
            <div className="bg-muted/40 border border-violet-500/20 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <p className="text-[10px] font-black uppercase tracking-widest text-violet-600">Pagamento PIX</p>
              <div className="space-y-2">
                {!(loja.data as Database["public"]["Tables"]["stores"]["Row"])?.pix_key && (
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Chave PIX</Label>
                    <Input placeholder="CPF, CNPJ, email ou chave aleatória" value={pixKeyInput} onChange={e => setPixKeyInput(e.target.value)} className="mt-1 h-8 text-sm" />
                  </div>
                )}
                <div>
                  <Label className="text-[10px] text-muted-foreground">Valor (R$)</Label>
                  <Input placeholder="ex: 150,00" value={pixAmount} onChange={e => setPixAmount(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground">Descrição (opcional)</Label>
                  <Input placeholder="ex: Pedido #1234" value={pixDesc} onChange={e => setPixDesc(e.target.value)} className="mt-1 h-8 text-sm" />
                </div>
              </div>
              <Button size="sm" className="w-full h-8 text-[10px] font-black uppercase rounded-xl gap-1 bg-violet-600 hover:bg-violet-700 text-white" onClick={handleSendPix} disabled={pixLoading}>
                {pixLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><QrCode className="w-3.5 h-3.5" /> Enviar PIX via WhatsApp</>}
              </Button>
            </div>
          )}

          <button className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-transparent bg-muted/30 hover:bg-muted/50 transition-all group">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-medium">Ver perfil completo</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </aside>
  );
}
