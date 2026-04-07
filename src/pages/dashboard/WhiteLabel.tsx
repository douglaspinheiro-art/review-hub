import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette, Globe, Mail, MessageSquare, Eye, Loader2, Lock, Users, TrendingUp, Copy, ExternalLink, Check, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const PRESET_COLORS = [
  "#7c3aed", "#2563eb", "#16a34a", "#dc2626",
  "#ea580c", "#0891b2", "#db2777", "#1f2937",
];

export default function WhiteLabel() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPaid = profile?.plan !== "starter";

  const { data: wl } = useQuery({
    queryKey: ["white_label"],
    queryFn: async () => {
      const { data } = await supabase
        .from("white_label")
        .select("*")
        .eq("user_id", user!.id)
        .single();
      return data;
    },
    enabled: !!user && isPaid,
  });

  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#7c3aed");
  const [customDomain, setCustomDomain] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportWhatsapp, setSupportWhatsapp] = useState("");
  const [hideBranding, setHideBranding] = useState(false);

  useEffect(() => {
    if (wl) {
      setBrandName(wl.brand_name ?? "");
      setLogoUrl(wl.brand_logo_url ?? "");
      setPrimaryColor(wl.primary_color ?? "#7c3aed");
      setCustomDomain(wl.custom_domain ?? "");
      setSupportEmail(wl.support_email ?? "");
      setSupportWhatsapp(wl.support_whatsapp ?? "");
      setHideBranding(wl.hide_conversahub_branding ?? false);
    }
  }, [wl]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        user_id: user!.id,
        brand_name: brandName || null,
        brand_logo_url: logoUrl || null,
        primary_color: primaryColor,
        custom_domain: customDomain || null,
        support_email: supportEmail || null,
        support_whatsapp: supportWhatsapp || null,
        hide_conversahub_branding: hideBranding,
      };
      const { error } = await supabase.from("white_label").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "White-label salvo!" });
      queryClient.invalidateQueries({ queryKey: ["white_label"] });
    },
    onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
  });

  if (!isPaid) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">White-label</h1>
          <p className="text-muted-foreground text-sm mt-1">Personalize a plataforma com sua marca</p>
        </div>
        <div className="bg-card border rounded-xl p-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">White-label disponível nos planos Escala e Enterprise</p>
            <p className="text-sm text-muted-foreground mt-1">
              Faça upgrade para personalizar domínio, cores, logo e remover a marca LTV Boost.
            </p>
          </div>
          <Button asChild>
            <a href="/dashboard/billing">Ver planos</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">White-label</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Personalize a plataforma com a identidade visual da sua agência ou empresa
        </p>
      </div>

      {/* Preview */}
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <p className="text-sm font-medium">Preview</p>
        <div
          className="border rounded-xl p-4 flex items-center gap-3"
          style={{ borderColor: primaryColor + "40" }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="logo" className="w-8 h-8 rounded object-contain" />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: primaryColor }}
            >
              {(brandName || "M")[0]?.toUpperCase()}
            </div>
          )}
          <span className="font-bold" style={{ color: primaryColor }}>
            {brandName || "Minha Empresa"}
          </span>
        </div>
      </div>

      {/* Branding */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Identidade visual</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nome da marca</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Minha Agência" />
          </div>
          <div className="space-y-1.5">
            <Label>URL do logo (PNG/SVG)</Label>
            <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Cor primária</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded-lg border cursor-pointer"
            />
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setPrimaryColor(c)}
                  className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: primaryColor === c ? c : "transparent",
                    outline: primaryColor === c ? `2px solid ${c}` : "none",
                    outlineOffset: "2px",
                  }}
                />
              ))}
            </div>
            <code className="text-xs text-muted-foreground font-mono">{primaryColor}</code>
          </div>
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={hideBranding}
            onChange={(e) => setHideBranding(e.target.checked)}
            className="w-4 h-4 accent-primary rounded"
          />
          <div>
            <p className="text-sm font-medium">Remover "Powered by LTV Boost"</p>
            <p className="text-xs text-muted-foreground">Remove a marca LTV Boost das mensagens e interface</p>
          </div>
        </label>
      </div>

      {/* Domínio */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Domínio personalizado</h2>
        </div>
        <div className="space-y-1.5">
          <Label>Domínio</Label>
          <Input
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="app.minhaagencia.com.br"
          />
          <p className="text-xs text-muted-foreground">
            Configure um CNAME apontando para <code className="font-mono">app.ltvboost.com</code> no seu DNS.
          </p>
        </div>
        {customDomain && (
          <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1 font-mono text-muted-foreground">
            <p>Registro DNS a configurar:</p>
            <p><strong>Tipo:</strong> CNAME</p>
            <p><strong>Nome:</strong> {customDomain.split(".")[0]}</p>
            <p><strong>Valor:</strong> app.ltvboost.com</p>
          </div>
        )}
      </div>

      {/* Suporte */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Contatos de suporte</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>E-mail de suporte</Label>
            <Input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              placeholder="suporte@minhaagencia.com"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
              <Label>WhatsApp de suporte</Label>
            </div>
            <Input
              value={supportWhatsapp}
              onChange={(e) => setSupportWhatsapp(e.target.value)}
              placeholder="5511999999999"
            />
          </div>
        </div>
      </div>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2">
        {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        Salvar white-label
      </Button>

      <AgencyPanel domain={customDomain} brandName={brandName} />
    </div>
  );
}

// ─── Agency Panel ─────────────────────────────────────────────────────────────
function AgencyPanel({ domain, brandName }: { domain: string; brandName: string }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = domain
    ? `https://${domain}/signup`
    : `https://app.ltvboost.com/signup?agency=${encodeURIComponent(brandName || "minha-agencia")}`;

  const copy = () => {
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Mock client list — virá de Supabase via agency_clients table
  const clientes = [
    { nome: "Studio Moda SP", plano: "Crescimento", mrr: 297, status: "ativo", desde: "Jan 2026" },
    { nome: "NutriShop Online", plano: "Escala", mrr: 697, status: "ativo", desde: "Fev 2026" },
    { nome: "Casa & Arte", plano: "Crescimento", mrr: 297, status: "trial", desde: "Mar 2026" },
    { nome: "Beleza Pura", plano: "Crescimento", mrr: 297, status: "ativo", desde: "Mar 2026" },
  ];

  const mrrTotal = clientes.filter(c => c.status === "ativo").reduce((s, c) => s + c.mrr, 0);
  const ativos = clientes.filter(c => c.status === "ativo").length;

  return (
    <div className="space-y-6 pt-6 border-t border-border/50">
      <div>
        <h2 className="text-lg font-bold">Painel de Agência</h2>
        <p className="text-muted-foreground text-sm mt-0.5">
          Gerencie as lojas clientes que acessam via sua marca.
        </p>
      </div>

      {/* Agency KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Clientes ativos", value: ativos, icon: Users, color: "text-primary" },
          { label: "MRR gerenciado", value: `R$ ${mrrTotal.toLocaleString('pt-BR')}`, icon: DollarSign, color: "text-emerald-600" },
          { label: "Churn este mês", value: "0", icon: TrendingUp, color: "text-blue-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card border rounded-xl p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{label}</p>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Invite link */}
      <div className="bg-card border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Link de cadastro dos seus clientes</h3>
          <a href={inviteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
            Abrir <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="flex gap-2">
          <div className="flex-1 h-10 rounded-md border border-input bg-muted px-3 flex items-center text-xs font-mono text-muted-foreground overflow-hidden">
            <span className="truncate">{inviteUrl}</span>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-2 h-10" onClick={copy}>
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copiado!" : "Copiar"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Quando um cliente se cadastra via este link, a conta já vem com sua marca aplicada.
        </p>
      </div>

      {/* Client list */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Lojas Clientes</h3>
          <Button size="sm" variant="outline" className="h-8 text-xs font-bold rounded-lg gap-1.5">
            <Users className="w-3.5 h-3.5" /> Convidar cliente
          </Button>
        </div>
        <div className="divide-y">
          {clientes.map((c) => (
            <div key={c.nome} className="px-5 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                {c.nome[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{c.nome}</p>
                <p className="text-xs text-muted-foreground">{c.plano} · desde {c.desde}</p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold text-emerald-600">R$ {c.mrr}/mês</span>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                  c.status === "ativo" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {c.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
