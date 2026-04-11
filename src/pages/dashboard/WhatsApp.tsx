import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, WifiOff, QrCode, Plus, Trash2, RefreshCw,
  Loader2, CheckCircle, AlertCircle, Settings, Zap, Copy, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  getQRCodeForConnection,
  getConnectionStateForConnection,
  mapEvolutionState,
  setWebhookForConnection,
  createInstanceForConnection,
  deleteInstanceForConnection,
  EVOLUTION_USE_PROXY,
} from "@/lib/evolution-api";
import { cn } from "@/lib/utils";
import {
  evolutionReadyForQr,
  metaShowsWebhookHelp,
  shouldWarnIncompleteSetup,
} from "@/lib/whatsapp/connection-ui";

type Connection = {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  evolution_api_url: string | null;
  evolution_api_key: string | null;
  provider?: string | null;
  meta_phone_number_id?: string | null;
  meta_waba_id?: string | null;
  meta_access_token?: string | null;
  meta_default_template_name?: string | null;
  store_id?: string | null;
  connected_at: string | null;
  created_at: string;
};

const STATUS_CONFIG = {
  connected: {
    label: "Conectado",
    color: "text-green-700 dark:text-green-400 bg-green-500/10 border-green-500/25",
  },
  connecting: {
    label: "Conectando…",
    color: "text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/25",
  },
  disconnected: {
    label: "Desconectado",
    color: "text-muted-foreground bg-muted border-border",
  },
  error: {
    label: "Erro",
    color: "text-destructive bg-destructive/10 border-destructive/25",
  },
};

type MetaVerifyResponse = { ok: boolean; error?: string; data?: { display_phone_number?: string; verified_name?: string } };

async function invokeMetaVerify(connectionId: string): Promise<MetaVerifyResponse> {
  const { data, error } = await supabase.functions.invoke<MetaVerifyResponse>("meta-whatsapp-send", {
    body: { connectionId, kind: "verify" },
  });
  if (error) return { ok: false, error: error.message };
  return data ?? { ok: false, error: "Resposta vazia" };
}

export default function WhatsApp() {
  const [showForm, setShowForm] = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [connectionProvider, setConnectionProvider] = useState<"evolution" | "meta_cloud">("evolution");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaDefaultTemplate, setMetaDefaultTemplate] = useState("");
  const [selectedApiConnectionId, setSelectedApiConnectionId] = useState<string | null>(null);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [storeListLoading, setStoreListLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [qrLoading, setQrLoading] = useState<Record<string, boolean>>({});
  const [countdownMap, setCountdownMap] = useState<Record<string, number>>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const metaWebhookUrl = useMemo(() => {
    const raw = import.meta.env.VITE_SUPABASE_URL;
    if (!raw || typeof raw !== "string") return "";
    const base = raw.replace(/\/$/, "");
    return `${base}/functions/v1/meta-whatsapp-webhook`;
  }, []);

  const connectionSelect = useMemo(
    () =>
      EVOLUTION_USE_PROXY
        ? "id, instance_name, phone_number, status, evolution_api_url, provider, meta_phone_number_id, meta_waba_id, meta_default_template_name, connected_at, created_at, store_id"
        : "id, instance_name, phone_number, status, evolution_api_url, evolution_api_key, provider, meta_phone_number_id, meta_waba_id, meta_default_template_name, connected_at, created_at, store_id",
    [],
  );

  const fetchLojas = useCallback(async () => {
    if (!user?.id) return;
    setStoreListLoading(true);
    const { data, error } = await supabase.from("stores").select("id, name").eq("user_id", user.id).order("name");
    if (error) {
      toast({ title: "Não foi possível carregar as lojas", variant: "destructive" });
      setLojas([]);
      setSelectedStoreId("");
    } else if (data?.length) {
      setLojas(data);
      setSelectedStoreId((prev) => (prev && data.some((s) => s.id === prev) ? prev : data[0].id));
    } else {
      setLojas([]);
      setSelectedStoreId("");
    }
    setStoreListLoading(false);
  }, [user?.id, toast]);

  useEffect(() => {
    void fetchLojas();
  }, [fetchLojas]);

  const copyMetaWebhookUrl = useCallback(() => {
    if (!metaWebhookUrl) {
      toast({
        title: "URL indisponível",
        description: "Configure VITE_SUPABASE_URL no ambiente do app.",
        variant: "destructive",
      });
      return;
    }
    void navigator.clipboard.writeText(metaWebhookUrl);
    toast({ title: "URL copiada", description: "Cole no Meta Developer → Webhook como Callback URL." });
  }, [metaWebhookUrl, toast]);

  const connectionsEnabled = !!user && !storeListLoading && (lojas.length === 0 || !!selectedStoreId);

  const {
    data: connections = [],
    isLoading,
    isError,
    error: connectionsError,
    refetch: refetchConnections,
  } = useQuery({
    queryKey: ["whatsapp_connections", user?.id ?? "", selectedStoreId],
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_connections")
        .select(connectionSelect)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      query = selectedStoreId ? query.eq("store_id", selectedStoreId) : query.is("store_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Connection[];
    },
    enabled: connectionsEnabled,
  });

  const apiFormHydrateKey = useMemo(() => {
    const c = connections.find((x) => x.id === selectedApiConnectionId);
    if (!c) return "";
    return [
      c.id,
      c.provider ?? "",
      c.evolution_api_url ?? "",
      c.evolution_api_key ?? "",
      c.meta_phone_number_id ?? "",
      c.meta_waba_id ?? "",
      c.meta_default_template_name ?? "",
    ].join("|");
  }, [connections, selectedApiConnectionId]);

  /** Preenche o formulário quando muda a conexão ou os dados vindos do servidor (evita apagar digitação em curso). */
  useEffect(() => {
    if (!showApiConfig || !selectedApiConnectionId) return;
    const c = connections.find((x) => x.id === selectedApiConnectionId);
    if (!c) return;
    setConnectionProvider(c.provider === "meta_cloud" ? "meta_cloud" : "evolution");
    setApiUrl(c.evolution_api_url ?? "");
    if (!EVOLUTION_USE_PROXY) {
      setApiKey(c.evolution_api_key ?? "");
    } else {
      setApiKey("");
    }
    setMetaPhoneNumberId(c.meta_phone_number_id ?? "");
    setMetaWabaId(c.meta_waba_id ?? "");
    setMetaDefaultTemplate(c.meta_default_template_name ?? "");
    setMetaAccessToken("");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `apiFormHydrateKey` agrega `connections`; evitar rehidratar a cada refetch.
  }, [showApiConfig, selectedApiConnectionId, apiFormHydrateKey]);

  const openApiConfig = useCallback(() => {
    setShowApiConfig(true);
    setSelectedApiConnectionId(connections[0]?.id ?? null);
  }, [connections]);

  const toggleApiConfig = useCallback(() => {
    if (showApiConfig) {
      setShowApiConfig(false);
    } else {
      openApiConfig();
    }
  }, [showApiConfig, openApiConfig]);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const isMeta = connectionProvider === "meta_cloud";
      const storeId = selectedStoreId || null;
      const row = {
        user_id: user!.id,
        store_id: storeId,
        instance_name: name.trim(),
        status: "disconnected" as const,
        provider: connectionProvider,
        evolution_api_url: !isMeta ? apiUrl?.trim() || null : null,
        evolution_api_key: !isMeta ? apiKey?.trim() || null : null,
        meta_phone_number_id: isMeta ? metaPhoneNumberId.trim() || null : null,
        meta_waba_id: isMeta ? metaWabaId.trim() || null : null,
        meta_access_token: isMeta ? metaAccessToken.trim() || null : null,
        meta_default_template_name: isMeta ? metaDefaultTemplate.trim() || null : null,
      };
      const { data: inserted, error } = await supabase
        .from("whatsapp_connections")
        .insert(row)
        .select(
          EVOLUTION_USE_PROXY
            ? "id, instance_name, evolution_api_url, provider"
            : "id, instance_name, evolution_api_url, evolution_api_key, provider",
        )
        .single();
      if (error) throw error;
      if (!isMeta && inserted?.evolution_api_url && (EVOLUTION_USE_PROXY || inserted?.evolution_api_key)) {
        try {
          await createInstanceForConnection(inserted as Parameters<typeof createInstanceForConnection>[0]);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          toast({
            title: "Instância salva; aviso da Evolution",
            description: `${msg} — você pode tentar gerar o QR Code mesmo assim.`,
            variant: "destructive",
          });
        }
      }
      if (isMeta && inserted?.id && metaPhoneNumberId.trim() && metaAccessToken.trim()) {
        const ver = await invokeMetaVerify(inserted.id as string);
        if (!ver.ok) {
          toast({
            title: "Conexão Meta salva",
            description: ver.error ?? "Valide o token com o botão «Validar com Meta».",
            variant: "destructive",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      setInstanceName("");
      setShowForm(false);
      toast({
        title: "Instância criada",
        description: connectionProvider === "meta_cloud"
          ? "Configure o webhook no Meta e use «Validar com Meta» se necessário."
          : "Clique em «Mostrar QR Code» para conectar.",
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao criar instância",
        description: e?.message ?? "Tente novamente.",
        variant: "destructive",
      }),
  });

  const updateApiMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const isMeta = connectionProvider === "meta_cloud";
      const patch: Record<string, unknown> = {
        provider: connectionProvider,
        evolution_api_url: !isMeta ? apiUrl.trim() || null : null,
        meta_phone_number_id: isMeta ? metaPhoneNumberId.trim() || null : null,
        meta_waba_id: isMeta ? metaWabaId.trim() || null : null,
        meta_default_template_name: isMeta ? metaDefaultTemplate.trim() || null : null,
      };
      if (!isMeta) {
        if (apiKey.trim()) {
          patch.evolution_api_key = apiKey.trim();
        }
      }
      if (isMeta && metaAccessToken.trim()) {
        patch.meta_access_token = metaAccessToken.trim();
      }
      const { error } = await supabase
        .from("whatsapp_connections")
        .update(patch)
        .eq("id", connectionId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      setShowApiConfig(false);
      toast({ title: "Configurações atualizadas", description: "Apenas a conexão selecionada foi alterada." });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao atualizar API",
        description: e?.message ?? "Tente novamente.",
        variant: "destructive",
      }),
  });

  const verifyMutation = useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await invokeMetaVerify(connectionId);
      if (!res.ok) throw new Error(res.error ?? "Falha na validação");
      return res;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      toast({
        title: "Meta validado",
        description: res.data?.display_phone_number
          ? `Número: ${res.data.display_phone_number}`
          : "Conexão ativa na Graph API.",
      });
    },
    onError: (e: Error) =>
      toast({
        title: "Validação Meta falhou",
        description: e?.message ?? "Confira phone number ID e token.",
        variant: "destructive",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase
        .from("whatsapp_connections")
        .select(
          EVOLUTION_USE_PROXY
            ? "id, instance_name, evolution_api_url, provider"
            : "id, instance_name, evolution_api_url, evolution_api_key, provider",
        )
        .eq("id", id)
        .single();
      const conn = (row as Connection | null) ?? null;
      if (
        conn &&
        conn.provider !== "meta_cloud" &&
        conn.evolution_api_url &&
        conn.evolution_api_key
      ) {
        try {
          await deleteInstanceForConnection(conn);
        } catch {
          /* seguimos e removemos no banco */
        }
      }
      const { error } = await supabase.from("whatsapp_connections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      setQrMap((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      toast({ title: "Instância removida" });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao remover",
        description: e?.message ?? "Tente novamente.",
        variant: "destructive",
      }),
  });

  const fetchQR = useCallback(async (conn: Connection) => {
    if (conn.provider === "meta_cloud") {
      toast({
        title: "Conexão Meta oficial",
        description: "Não é necessário QR Code. O número é gerenciado no Facebook / Meta Business.",
      });
      return;
    }
    if (!conn.evolution_api_url || !conn.evolution_api_key) {
      toast({
        title: "Evolution API não configurada",
        description: "Configure a URL e chave da API em Configurar API.",
        variant: "destructive",
      });
      return;
    }
    setQrLoading((m) => ({ ...m, [conn.id]: true }));
    try {
      const data = await getQRCodeForConnection(conn);
      const src = data.base64.startsWith("data:") ? data.base64 : `data:image/png;base64,${data.base64}`;
      setQrMap((m) => ({ ...m, [conn.id]: src }));
      setCountdownMap((m) => ({ ...m, [conn.id]: 60 }));
      await supabase.from("whatsapp_connections").update({ status: "connecting" }).eq("id", conn.id);
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
    } catch (err: unknown) {
      toast({
        title: "Erro ao buscar QR Code",
        description: (err as Error)?.message ?? "Verifique se a Evolution API está acessível.",
        variant: "destructive",
      });
    } finally {
      setQrLoading((m) => ({ ...m, [conn.id]: false }));
    }
  }, [toast, queryClient]);

  const checkConnectionState = useCallback(async (conn: Connection) => {
    if (conn.provider === "meta_cloud") return;
    if (!conn.evolution_api_url || !conn.evolution_api_key) return;
    try {
      const state = await getConnectionStateForConnection(conn);
      const mapped = mapEvolutionState(state.state);
      if (mapped === "connected") {
        setQrMap((m) => {
          const n = { ...m };
          delete n[conn.id];
          return n;
        });
        await supabase.from("whatsapp_connections").update({
          status: "connected",
          connected_at: new Date().toISOString(),
        }).eq("id", conn.id);
        try {
          const appUrl = import.meta.env.VITE_SUPABASE_URL || "";
          if (appUrl) {
            await setWebhookForConnection(conn, `${appUrl.replace(/\/$/, "")}/functions/v1/whatsapp-webhook`);
          }
        } catch {
          /* webhook opcional */
        }
        queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
        toast({ title: "WhatsApp conectado!", description: `Instância ${conn.instance_name} está ativa.` });
      }
    } catch {
      /* polling silencioso */
    }
  }, [queryClient, toast]);

  useEffect(() => {
    const ids = Object.keys(qrMap);
    if (ids.length === 0) return;
    const interval = setInterval(() => {
      ids.forEach((id) => {
        const conn = connections.find((c) => c.id === id);
        if (conn) void checkConnectionState(conn);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [qrMap, connections, checkConnectionState]);

  useEffect(() => {
    const ids = Object.keys(qrMap);
    if (ids.length === 0) return;
    const t = setInterval(() => {
      setCountdownMap((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          if ((next[id] ?? 0) > 0) next[id] = (next[id] ?? 0) - 1;
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [qrMap]);

  const selectedStoreLabel = lojas.find((s) => s.id === selectedStoreId)?.name ?? "";

  const canSaveApi =
    !!selectedApiConnectionId &&
    (connectionProvider === "evolution"
      ? !!(apiUrl.trim() && (EVOLUTION_USE_PROXY || apiKey.trim()))
      : !!metaPhoneNumberId.trim());

  const showInitialSpinner = storeListLoading || (connectionsEnabled && isLoading);

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie suas conexões do WhatsApp Business</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lojas.length > 1 && (
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger className="w-[200px] h-9">
                <SelectValue placeholder="Loja" />
              </SelectTrigger>
              <SelectContent>
                {lojas.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggleApiConfig} className="gap-2 border-primary/20 hover:bg-primary/5">
              <Settings className="w-4 h-4" />
              Configurar API
            </Button>
            <Button onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Nova instância
            </Button>
          </div>
        </div>
      </div>

      {lojas.length === 1 && selectedStoreLabel && (
        <p className="text-xs text-muted-foreground">
          Loja: <span className="font-medium text-foreground">{selectedStoreLabel}</span>
        </p>
      )}

      {showApiConfig && (
        <Card className="p-6 space-y-4 border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary" />
            <h2 className="font-bold">Configuração WhatsApp</h2>
          </div>
          {connections.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="api-conn">Conexão (instância)</Label>
              <Select
                value={selectedApiConnectionId ?? ""}
                onValueChange={(v) => setSelectedApiConnectionId(v || null)}
              >
                <SelectTrigger id="api-conn" className="max-w-md">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground rounded-lg border border-dashed px-3 py-2">
              Crie uma instância nesta loja antes de salvar credenciais aqui.
            </p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="conn-provider">Provedor</Label>
            <select
              id="conn-provider"
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={connectionProvider}
              onChange={(e) => setConnectionProvider(e.target.value as "evolution" | "meta_cloud")}
            >
              <option value="evolution">Evolution API (self-hosted)</option>
              <option value="meta_cloud">Meta — WhatsApp Cloud API (oficial)</option>
            </select>
          </div>
          {connectionProvider === "evolution" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="api-url">URL da API</Label>
                <Input
                  id="api-url"
                  placeholder="https://sua-api.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="api-key">Chave da API (ApiKey)</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder={EVOLUTION_USE_PROXY ? "Preencha para atualizar a chave" : "sua_chave_secreta"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="meta-phone-id">Phone number ID (Graph API)</Label>
                <Input
                  id="meta-phone-id"
                  placeholder="ID do número no Meta Business"
                  value={metaPhoneNumberId}
                  onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-waba">WABA ID (opcional)</Label>
                <Input
                  id="meta-waba"
                  placeholder="WhatsApp Business Account ID"
                  value={metaWabaId}
                  onChange={(e) => setMetaWabaId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="meta-token">Access token (permanente do sistema)</Label>
                <Input
                  id="meta-token"
                  type="password"
                  autoComplete="off"
                  placeholder="EAA... (deixe em branco para manter o token atual)"
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="meta-template">Template padrão (campanhas / fora da janela 24h)</Label>
                <Input
                  id="meta-template"
                  placeholder="nome_exato_do_template_aprovado"
                  value={metaDefaultTemplate}
                  onChange={(e) => setMetaDefaultTemplate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label>Callback URL do webhook (Meta Developer)</Label>
                <div className="flex gap-2 flex-wrap">
                  <Input
                    readOnly
                    value={metaWebhookUrl || "Defina VITE_SUPABASE_URL no build para exibir a URL"}
                    className="font-mono text-xs flex-1 min-w-[12rem]"
                  />
                  <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={copyMetaWebhookUrl}>
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  No app Meta: Webhook → mesmo valor em <code className="bg-muted px-1 rounded">META_WHATSAPP_VERIFY_TOKEN</code> (secret da função) e <code className="bg-muted px-1 rounded">META_APP_SECRET</code> para assinatura.
                </p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => selectedApiConnectionId && updateApiMutation.mutate(selectedApiConnectionId)}
              disabled={!canSaveApi || updateApiMutation.isPending}
              className="gap-2"
            >
              {updateApiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Salvar nesta conexão
            </Button>
            {connectionProvider === "meta_cloud" && selectedApiConnectionId && (
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate(selectedApiConnectionId)}
              >
                {verifyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Validar com Meta
              </Button>
            )}
            <Button variant="ghost" onClick={() => setShowApiConfig(false)}>
              Cancelar
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            Meta: deploy de <code className="bg-muted px-0.5 rounded">meta-whatsapp-webhook</code> e <code className="bg-muted px-0.5 rounded">meta-whatsapp-send</code>. Guia: <code className="bg-muted px-0.5 rounded">docs/meta-whatsapp-cloud-setup.md</code>.
          </p>
        </Card>
      )}

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2">
          <h2 className="font-semibold">Nova instância WhatsApp</h2>
          {selectedStoreLabel ? (
            <p className="text-xs text-muted-foreground">
              Será associada à loja: <span className="font-medium text-foreground">{selectedStoreLabel}</span>
            </p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="new-provider">Provedor</Label>
            <select
              id="new-provider"
              className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={connectionProvider}
              onChange={(e) => setConnectionProvider(e.target.value as "evolution" | "meta_cloud")}
            >
              <option value="evolution">Evolution API</option>
              <option value="meta_cloud">Meta Cloud API</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instance-name">Nome da instância</Label>
            <Input
              id="instance-name"
              placeholder="ex: loja-principal, atendimento"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && instanceName.trim() && !createMutation.isPending) {
                  createMutation.mutate(instanceName);
                }
              }}
            />
          </div>
          {connectionProvider === "evolution" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="create-api-url">URL da Evolution API</Label>
                <Input
                  id="create-api-url"
                  placeholder="https://sua-api.com"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-api-key">Chave da API</Label>
                <Input
                  id="create-api-key"
                  type="password"
                  placeholder="ApiKey da instância"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="create-meta-phone">Phone number ID</Label>
                <Input
                  id="create-meta-phone"
                  placeholder="ID do número (Graph API)"
                  value={metaPhoneNumberId}
                  onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-meta-token">Access token</Label>
                <Input
                  id="create-meta-token"
                  type="password"
                  autoComplete="off"
                  placeholder="EAA..."
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="create-meta-template">Template padrão (opcional na criação)</Label>
                <Input
                  id="create-meta-template"
                  placeholder="nome_do_template_aprovado"
                  value={metaDefaultTemplate}
                  onChange={(e) => setMetaDefaultTemplate(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => createMutation.mutate(instanceName)}
              disabled={
                !instanceName.trim() ||
                createMutation.isPending ||
                (connectionProvider === "evolution" && (!apiUrl.trim() || !apiKey.trim())) ||
                (connectionProvider === "meta_cloud" && (!metaPhoneNumberId.trim() || !metaAccessToken.trim()))
              }
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar instância
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setInstanceName(""); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {showInitialSpinner ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <p className="text-sm font-medium text-destructive">Não foi possível carregar as conexões</p>
          <p className="text-xs text-muted-foreground">{(connectionsError as Error)?.message ?? "Erro desconhecido"}</p>
          <Button variant="outline" size="sm" onClick={() => void refetchConnections()}>
            Tentar novamente
          </Button>
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-card border rounded-xl p-10 text-center space-y-3">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto">
            <WifiOff className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="font-medium">Nenhuma instância nesta loja</p>
          <p className="text-sm text-muted-foreground">
            {lojas.length
              ? "Crie uma instância para conectar o WhatsApp desta loja (necessário para automações e carrinho abandonado)."
              : "Crie uma loja no onboarding ou em Configurações, depois adicione o WhatsApp."}
          </p>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Criar primeira instância
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => {
            const cfg = STATUS_CONFIG[conn.status] ?? STATUS_CONFIG.disconnected;
            const qr = qrMap[conn.id];
            const loadingQR = qrLoading[conn.id];
            const hasEvolutionCfg = evolutionReadyForQr(conn);
            const showMetaWebhook = metaShowsWebhookHelp(conn);
            const warnSetup = shouldWarnIncompleteSetup(conn);
            const countdown = countdownMap[conn.id] ?? 0;
            const qrExpired = qr && countdown <= 0;

            return (
              <div key={conn.id} className="bg-card border rounded-xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg border",
                        conn.status === "connected"
                          ? "border-green-500/25 bg-green-500/10"
                          : "border-border bg-muted",
                      )}
                    >
                      {conn.status === "connected" ? (
                        <Wifi className="w-5 h-5 text-green-600 dark:text-green-400" />
                      ) : (
                        <WifiOff className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium flex items-center gap-2 flex-wrap">
                        {conn.instance_name}
                        <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-muted border">
                          {conn.provider === "meta_cloud" ? "Meta Cloud" : "Evolution"}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {conn.phone_number ?? (conn.provider === "meta_cloud" ? "Cloud API" : "Número não conectado")}
                      </p>
                    </div>
                  </div>
                  <span className={cn("text-xs px-2 py-1 rounded-full border font-medium shrink-0", cfg.color)}>
                    {cfg.label}
                  </span>
                </div>

                {warnSetup && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Configure a API em <strong>Configurar API</strong>
                      {conn.provider === "meta_cloud" ? " (Phone number ID + token) e valide com Meta." : " para ativar o QR Code."}
                    </span>
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 font-semibold hover:underline shrink-0"
                      onClick={openApiConfig}
                    >
                      <Settings className="w-3 h-3" />
                      Abrir
                    </button>
                  </div>
                )}

                {conn.provider !== "meta_cloud" && conn.status !== "connected" && hasEvolutionCfg && (
                  <div className="border-t pt-4">
                    {qr ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          {qrExpired ? (
                            <>
                              <div className="w-2 h-2 rounded-full bg-destructive" />
                              <p className="text-sm font-medium text-destructive">QR Code expirado</p>
                            </>
                          ) : (
                            <>
                              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                Aguardando leitura — <span className="font-black">{countdown}s</span>
                              </p>
                            </>
                          )}
                        </div>
                        <div className="flex gap-6 items-start">
                          {qrExpired ? (
                            <div className="w-44 h-44 border-4 border-destructive/20 rounded-xl bg-destructive/5 flex flex-col items-center justify-center gap-3">
                              <p className="text-xs font-bold text-destructive text-center">QR expirado</p>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchQR(conn)} disabled={loadingQR}>
                                {loadingQR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                Gerar novo
                              </Button>
                            </div>
                          ) : (
                            <img
                              src={qr}
                              alt="QR Code WhatsApp"
                              className="w-44 h-44 border-4 border-white rounded-xl shadow-md dark:border-border"
                            />
                          )}
                          <div className="space-y-3 text-sm text-muted-foreground">
                            <p className="font-medium text-foreground">Como conectar:</p>
                            <ol className="list-decimal list-inside space-y-1.5">
                              <li>Abra o WhatsApp no seu celular</li>
                              <li>Toque em <strong>Dispositivos vinculados</strong></li>
                              <li>Toque em <strong>Vincular um dispositivo</strong></li>
                              <li>Aponte a câmera para o QR Code</li>
                            </ol>
                            {!qrExpired && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2 mt-2"
                                onClick={() => fetchQR(conn)}
                                disabled={loadingQR}
                              >
                                {loadingQR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                Atualizar QR
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Button size="sm" className="gap-2" onClick={() => fetchQR(conn)} disabled={loadingQR}>
                          {loadingQR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />}
                          {loadingQR ? "Carregando QR Code…" : "Mostrar QR Code"}
                        </Button>
                        <p className="text-xs text-muted-foreground">Escaneie com o WhatsApp Business para conectar</p>
                      </div>
                    )}
                  </div>
                )}

                {conn.provider === "meta_cloud" && showMetaWebhook && (
                  <div className="text-xs text-muted-foreground border-t pt-3 space-y-2">
                    <p className="font-medium text-foreground">Webhook Meta Cloud</p>
                    <div className="flex gap-2 flex-wrap items-center">
                      <Input
                        readOnly
                        value={metaWebhookUrl || "—"}
                        className="font-mono text-[10px] h-8 flex-1 min-w-[10rem] bg-muted/30"
                      />
                      <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={copyMetaWebhookUrl}>
                        <Copy className="w-3 h-3" />
                        Copiar URL
                      </Button>
                    </div>
                    <p>
                      Verify token = secret <code className="text-[10px] bg-muted px-1 rounded">META_WHATSAPP_VERIFY_TOKEN</code>.
                      Assinatura POST = <code className="text-[10px] bg-muted px-1 rounded">META_APP_SECRET</code>.
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="gap-2"
                      disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate(conn.id)}
                    >
                      {verifyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      Validar com Meta
                    </Button>
                  </div>
                )}

                {conn.status === "connected" && (
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-500/10 border border-green-500/25 rounded-lg px-3 py-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    Conectado desde{" "}
                    {conn.connected_at ? new Date(conn.connected_at).toLocaleDateString("pt-BR") : "—"}
                  </div>
                )}

                <div className="flex items-center gap-2 justify-end border-t pt-3">
                  {conn.provider !== "meta_cloud" && conn.status !== "connected" && hasEvolutionCfg && !qr && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground h-8"
                      onClick={() => fetchQR(conn)}
                      disabled={loadingQR}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Reconectar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-destructive hover:text-destructive h-8"
                    onClick={() => setDeleteTarget({ id: conn.id, name: conn.instance_name })}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remover
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-muted/50 border rounded-xl p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Como conectar</p>
        <p className="text-xs">
          <strong>Evolution:</strong> crie uma instância, use <strong>Configurar API</strong> (URL + chave) na mesma conexão,{" "}
          <strong>Mostrar QR Code</strong> e aguarde a confirmação.
        </p>
        <p className="text-xs">
          <strong>Meta Cloud API:</strong> credenciais por conexão + <strong>Validar com Meta</strong>. Copie a URL do webhook no Meta Developer. Documentação:{" "}
          <code className="text-[10px] bg-background px-1 rounded border">docs/meta-whatsapp-cloud-setup.md</code>.
        </p>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover instância?</AlertDialogTitle>
            <AlertDialogDescription>
              A instância <strong>{deleteTarget?.name}</strong> será removida. Campanhas e automações desta loja deixam de usar este número até criar outra conexão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Remover
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
