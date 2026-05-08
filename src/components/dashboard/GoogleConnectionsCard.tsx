import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, Clock, BarChart3, Star, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useStoreScope } from "@/contexts/StoreScopeContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type StoreGoogleRow = {
  id: string;
  ga4_account_email: string | null;
  ga4_property_id: string | null;
  google_business_account_id: string | null;
  google_business_location_id: string | null;
};

/**
 * Card to (re)connect Google services for the active store:
 * - Google Analytics 4 (funnel)
 * - Google Business Profile (reviews sync)
 */
export function GoogleConnectionsCard() {
  const scope = useStoreScope();
  const storeId = scope.activeStoreId;
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState<null | "ga4" | "business">(null);
  const [syncing, setSyncing] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [locationId, setLocationId] = useState("");

  const { data: store } = useQuery({
    queryKey: ["store-google", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, ga4_account_email, ga4_property_id, google_business_account_id, google_business_location_id")
        .eq("id", storeId!)
        .single();
      if (error) throw error;
      return data as StoreGoogleRow;
    },
  });

  useEffect(() => {
    if (store?.google_business_account_id) setAccountId(store.google_business_account_id);
    if (store?.google_business_location_id) setLocationId(store.google_business_location_id);
  }, [store?.google_business_account_id, store?.google_business_location_id]);

  const ga4Connected = !!store?.ga4_account_email;
  const businessReady = !!store?.google_business_account_id && !!store?.google_business_location_id;

  async function startOAuth(scopeSet: "ga4" | "business" | "all") {
    if (!storeId) {
      toast.error("Selecione uma loja primeiro.");
      return;
    }
    setConnecting(scopeSet === "ga4" ? "ga4" : "business");
    try {
      const { data, error } = await supabase.functions.invoke("google-oauth-callback", {
        method: "GET",
        body: undefined,
        // invoke doesn't support GET easily; use direct URL
      });
      // Fallback: build URL manually
      const base = `${(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "")}/functions/v1/google-oauth-callback`;
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Sessão expirada");
      const startUrl = `${base}?action=start&store_id=${encodeURIComponent(storeId)}&scope_set=${scopeSet}`;
      const r = await fetch(startUrl, { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!r.ok) throw new Error(`Falha ao iniciar OAuth (${r.status})`);
      const { url } = await r.json() as { url: string };
      void data; void error; // suppress unused

      // Open OAuth popup
      const w = window.open(url, "google-oauth", "width=520,height=640");
      const handler = (ev: MessageEvent) => {
        if (ev.data?.type === "ga4_oauth_result") {
          window.removeEventListener("message", handler);
          setConnecting(null);
          if (ev.data.success) {
            toast.success("Conta Google conectada!");
            void queryClient.invalidateQueries({ queryKey: ["store-google", storeId] });
          } else {
            toast.error(ev.data.error ?? "Falha na conexão");
          }
          try { w?.close(); } catch { /* noop */ }
        }
      };
      window.addEventListener("message", handler);
      // Safety timeout
      setTimeout(() => { setConnecting(null); }, 120_000);
    } catch (e) {
      setConnecting(null);
      toast.error(e instanceof Error ? e.message : "Erro ao conectar");
    }
  }

  async function saveBusinessIds() {
    if (!storeId) return;
    if (!accountId.trim() || !locationId.trim()) {
      toast.error("Informe accounts/{id} e locations/{id}");
      return;
    }
    const { error } = await supabase.from("stores").update({
      google_business_account_id: accountId.trim(),
      google_business_location_id: locationId.trim(),
    }).eq("id", storeId);
    if (error) { toast.error(error.message); return; }
    toast.success("Localização do Google Business salva.");
    void queryClient.invalidateQueries({ queryKey: ["store-google", storeId] });
  }

  async function syncReviews() {
    if (!storeId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-google-reviews", {
        body: { store_id: storeId },
      });
      if (error) throw error;
      const result = data as { fetched?: number; upserted?: number };
      toast.success(`Sincronizado: ${result.fetched ?? 0} avaliações`);
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* GA4 row */}
      <div className="flex items-center justify-between p-4 bg-muted/20 rounded-2xl border border-border/40">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shadow-inner">
            <BarChart3 className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <div className="text-sm font-bold">Google Analytics 4</div>
            <div className={cn(
              "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
              ga4Connected ? "text-emerald-500" : "text-amber-500"
            )}>
              {ga4Connected
                ? (<><Check className="w-3 h-3" /> {store?.ga4_account_email}</>)
                : (<><Clock className="w-3 h-3" /> Não conectado</>)}
            </div>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs font-bold rounded-lg h-9"
          onClick={() => startOAuth("ga4")}
          disabled={connecting !== null}
        >
          {connecting === "ga4" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ga4Connected ? "Reconectar" : "Conectar"}
        </Button>
      </div>

      {/* Google Business row */}
      <div className="p-4 bg-muted/20 rounded-2xl border border-border/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center shadow-inner">
              <Star className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <div className="text-sm font-bold">Google Business Profile</div>
              <div className={cn(
                "text-[10px] font-bold uppercase tracking-widest flex items-center gap-1",
                businessReady ? "text-emerald-500" : "text-amber-500"
              )}>
                {businessReady ? (<><Check className="w-3 h-3" /> Localização configurada</>) : (<><Clock className="w-3 h-3" /> Configurar localização</>)}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="text-xs font-bold rounded-lg h-9" onClick={() => startOAuth("business")} disabled={connecting !== null}>
              {connecting === "business" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Autorizar"}
            </Button>
            <Button type="button" size="sm" className="text-xs font-bold rounded-lg h-9 gap-1" onClick={syncReviews} disabled={!businessReady || syncing}>
              {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Sincronizar
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border/30">
          <div>
            <Label htmlFor="gb-account" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Account ID</Label>
            <Input id="gb-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="accounts/123..." className="h-9 text-xs font-mono" />
          </div>
          <div>
            <Label htmlFor="gb-location" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Location ID</Label>
            <Input id="gb-location" value={locationId} onChange={(e) => setLocationId(e.target.value)} placeholder="locations/456..." className="h-9 text-xs font-mono" />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="button" variant="outline" size="sm" className="text-xs font-bold h-8" onClick={saveBusinessIds}>Salvar localização</Button>
          </div>
        </div>
      </div>
    </div>
  );
}