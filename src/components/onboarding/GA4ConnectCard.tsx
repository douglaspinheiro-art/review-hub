import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface GA4ConnectCardProps {
  storeId: string | null;
  onConnected?: (info: { email: string; propertyId: string | null }) => void;
}

/**
 * Optional GA4 connect card used inside the onboarding Step 4.
 * Reuses the `google-oauth-callback` edge function (scope_set=ga4)
 * and refreshes from `stores` after the popup completes.
 */
export function GA4ConnectCard({ storeId, onConnected }: GA4ConnectCardProps) {
  const [connecting, setConnecting] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!storeId) { setLoaded(true); return; }
    (async () => {
      const { data } = await supabase
        .from("stores")
        .select("ga4_account_email, ga4_property_id")
        .eq("id", storeId)
        .maybeSingle();
      if (cancelled) return;
      setEmail(data?.ga4_account_email ?? null);
      setPropertyId(data?.ga4_property_id ?? null);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  async function startOAuth() {
    if (!storeId) {
      toast.error("Salve a loja antes de conectar o GA4.");
      return;
    }
    setConnecting(true);
    try {
      const base = `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/google-oauth-callback`;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Sessão expirada");
      const startUrl = `${base}?action=start&store_id=${encodeURIComponent(storeId)}&scope_set=ga4`;
      const r = await fetch(startUrl, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!r.ok) throw new Error(`Falha ao iniciar OAuth (${r.status})`);
      const { url } = await r.json() as { url: string };

      const w = window.open(url, "google-oauth", "width=520,height=640");
      const handler = async (ev: MessageEvent) => {
        if (ev.data?.type !== "ga4_oauth_result") return;
        window.removeEventListener("message", handler);
        setConnecting(false);
        if (ev.data.success) {
          toast.success("Google Analytics 4 conectado!");
          const { data } = await supabase
            .from("stores")
            .select("ga4_account_email, ga4_property_id")
            .eq("id", storeId)
            .maybeSingle();
          setEmail(data?.ga4_account_email ?? null);
          setPropertyId(data?.ga4_property_id ?? null);
          if (data?.ga4_account_email) {
            onConnected?.({ email: data.ga4_account_email, propertyId: data.ga4_property_id ?? null });
          }
        } else {
          toast.error(ev.data.error ?? "Falha na conexão");
        }
        try { w?.close(); } catch { /* noop */ }
      };
      window.addEventListener("message", handler);
      setTimeout(() => setConnecting(false), 120_000);
    } catch (e) {
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : "Erro ao conectar");
    }
  }

  const connected = !!email;

  return (
    <div className="rounded-2xl border border-[#1E1E2E] bg-[#0F0F17] p-5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
          <BarChart3 className="w-6 h-6 text-blue-400" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-bold flex items-center gap-2">
            Google Analytics 4
            <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-medium">opcional</span>
          </div>
          {connected ? (
            <div className="text-xs text-emerald-400 flex items-center gap-1.5 mt-0.5 truncate">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{email}{propertyId ? ` · property ${propertyId}` : ""}</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-0.5 max-w-md">
              Conecte para importar visitantes, add-to-cart e checkout reais — sem GA4 a IA estima a partir do faturamento.
            </div>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant={connected ? "outline" : "default"}
        size="sm"
        onClick={startOAuth}
        disabled={connecting || !loaded}
        className="shrink-0 h-10 rounded-xl text-xs font-bold"
      >
        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : connected ? "Trocar conta" : "Conectar GA4"}
      </Button>
    </div>
  );
}