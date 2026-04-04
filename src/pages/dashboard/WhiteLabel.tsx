import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Palette, Globe, Mail, MessageSquare, Eye, Loader2, Lock } from "lucide-react";
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
    </div>
  );
}
