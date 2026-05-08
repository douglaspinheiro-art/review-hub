import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [properties, setProperties] = useState<Array<{ id: string; name: string; account_name: string }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedProperty, setPickedProperty] = useState<string>("");
  const [savingProperty, setSavingProperty] = useState(false);
  const pollRef = useRef<number | null>(null);

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
      // Se a loja já tem GA4 totalmente conectado, dispara importação automaticamente
      // para preencher visitantes/carrinho/checkout/pedidos sem exigir novo clique.
      if (data?.ga4_account_email && data?.ga4_property_id) {
        onConnected?.({ email: data.ga4_account_email, propertyId: data.ga4_property_id });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  // Cleanup polling on unmount
  useEffect(() => () => {
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  async function completePropertySelection(incomingEmail: string | null, showSuccessToast = false) {
    if (!storeId) return;
    setConnecting(false);
    if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    if (showSuccessToast) toast.success("Google Analytics 4 conectado!");

    // Refresh stored email/property
    const { data: store } = await supabase
      .from("stores")
      .select("ga4_account_email, ga4_property_id")
      .eq("id", storeId)
      .maybeSingle();
    const finalEmail = store?.ga4_account_email ?? incomingEmail ?? null;
    setEmail(finalEmail);
    setPropertyId(store?.ga4_property_id ?? null);

    // If property already set, we're done
    if (store?.ga4_property_id) {
      onConnected?.({ email: finalEmail ?? "", propertyId: store.ga4_property_id });
      return;
    }

    // Otherwise, list properties and either auto-pick or open selector
    try {
      const { data, error } = await supabase.functions.invoke("list-ga4-properties", {
        body: { store_id: storeId },
      });
      if (error) throw error;
      const list = (data?.properties ?? []) as Array<{ id: string; name: string; account_name: string }>;
      if (list.length === 0) {
        toast.error("Nenhuma propriedade GA4 encontrada para essa conta Google. Crie ou compartilhe acesso a uma property.");
        return;
      }
      if (list.length === 1) {
        await saveProperty(list[0].id, finalEmail);
        return;
      }
      setProperties(list);
      setPickedProperty(list[0].id);
      setPickerOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao listar propriedades GA4");
    }
  }

  async function handleOAuthSuccess(incomingEmail: string | null) {
    await completePropertySelection(incomingEmail, true);
  }

  async function saveProperty(propId: string, knownEmail: string | null) {
    if (!storeId) return;
    setSavingProperty(true);
    try {
      const { error } = await supabase
        .from("stores")
        .update({ ga4_property_id: propId })
        .eq("id", storeId);
      if (error) throw error;
      setPropertyId(propId);
      setPickerOpen(false);
      onConnected?.({ email: knownEmail ?? email ?? "", propertyId: propId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar propriedade");
    } finally {
      setSavingProperty(false);
    }
  }

  async function startOAuth() {
    if (!storeId) {
      toast.error("Salve a loja antes de conectar o GA4.");
      return;
    }
    setConnecting(true);

    if (email && !propertyId) {
      await completePropertySelection(email);
      return;
    }

    // BroadcastChannel fallback (works even if window.opener is null due to COOP)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel("ga4_oauth");
      bc.onmessage = (ev: MessageEvent) => {
        if (ev.data?.type !== "ga4_oauth_result") return;
        if (ev.data.success) {
          handleOAuthSuccess(ev.data.email ?? null);
        } else {
          setConnecting(false);
          toast.error(ev.data.error ?? "Falha na conexão");
        }
        try { bc?.close(); } catch { /* noop */ }
      };
    } catch { /* unsupported, ignore */ }

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
        if (ev.data.success) {
          handleOAuthSuccess(ev.data.email ?? null);
        } else {
          setConnecting(false);
          toast.error(ev.data.error ?? "Falha na conexão");
        }
        try { w?.close(); } catch { /* noop */ }
      };
      window.addEventListener("message", handler);

      // Polling fallback: if neither postMessage nor BroadcastChannel arrived,
      // detect token persisted by the callback by re-reading the row.
      const startedAt = Date.now();
      pollRef.current = window.setInterval(async () => {
        if (Date.now() - startedAt > 120_000) {
          if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
          setConnecting(false);
          return;
        }
        const { data } = await supabase
          .from("stores")
          .select("ga4_account_email, ga4_token_expires_at")
          .eq("id", storeId)
          .maybeSingle();
        if (data?.ga4_account_email || data?.ga4_token_expires_at) {
          handleOAuthSuccess(data.ga4_account_email);
        }
      }, 2500);
    } catch (e) {
      setConnecting(false);
      toast.error(e instanceof Error ? e.message : "Erro ao conectar");
    }
  }

  const connected = !!email && !!propertyId;

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
          ) : email && !propertyId ? (
            <div className="text-xs text-amber-400 mt-0.5 max-w-md">
              Conta {email} conectada — escolha a propriedade GA4 para finalizar.
            </div>
          ) : (
            <div className="text-xs text-muted-foreground mt-0.5 max-w-md">
              Conecte para importar visitantes, add-to-cart e checkout reais — sem GA4 a IA estima a partir do faturamento.
            </div>
          )}
          {pickerOpen && properties.length > 0 && (
            <div className="mt-3 flex items-center gap-2">
              <Select value={pickedProperty} onValueChange={setPickedProperty}>
                <SelectTrigger className="h-9 w-[280px] text-xs">
                  <SelectValue placeholder="Escolha a propriedade" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      {p.account_name ? `${p.account_name} · ` : ""}{p.name} ({p.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                onClick={() => saveProperty(pickedProperty, email)}
                disabled={!pickedProperty || savingProperty}
                className="h-9 rounded-xl text-xs font-bold"
              >
                {savingProperty ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar"}
              </Button>
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