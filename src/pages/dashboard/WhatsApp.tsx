import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, WifiOff, QrCode, Plus, Trash2, RefreshCw,
  Loader2, CheckCircle, AlertCircle, Settings, Zap, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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
  connected_at: string | null;
  created_at: string;
};

const STATUS_CONFIG = {
  connected:    { label: "Conectado",    color: "text-green-600 bg-green-50 border-green-200" },
  connecting:   { label: "Conectando…",  color: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  disconnected: { label: "Desconectado", color: "text-muted-foreground bg-muted border-border" },
  error:        { label: "Erro",         color: "text-red-600 bg-red-50 border-red-200" },
};

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
  
  // qrMap: connId → base64 QR string
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [qrLoading, setQrLoading] = useState<Record<string, boolean>>({});
  // countdownMap: connId → seconds remaining (60→0)
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

  const connectionSelect = useMemo(() => (
    EVOLUTION_USE_PROXY
      ? "id, instance_name, phone_number, status, evolution_api_url, provider, meta_phone_number_id, meta_waba_id, meta_default_template_name, connected_at, created_at"
      : "id, instance_name, phone_number, status, evolution_api_url, evolution_api_key, provider, meta_phone_number_id, meta_waba_id, meta_default_template_name, connected_at, created_at"
  ), []);

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

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["whatsapp_connections"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_connections")
        .select(connectionSelect)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Auto-set API URL/Key from first connection if available
      if (data && data.length > 0) {
        const first = (data as Connection[])[0];
        if (!apiUrl && first.evolution_api_url) setApiUrl(first.evolution_api_url);
        if (!EVOLUTION_USE_PROXY && !apiKey && first.evolution_api_key) setApiKey(first.evolution_api_key);
        if (first.provider === "meta_cloud" || first.provider === "evolution") {
          setConnectionProvider(first.provider);
        }
        if (first.meta_phone_number_id) setMetaPhoneNumberId(first.meta_phone_number_id);
        if (first.meta_waba_id) setMetaWabaId(first.meta_waba_id);
        if (first.meta_default_template_name) setMetaDefaultTemplate(first.meta_default_template_name);
      }
      
      return data as unknown as Connection[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const isMeta = connectionProvider === "meta_cloud";
      const row = {
        user_id: user!.id,
        instance_name: name.trim(),
        status: isMeta && metaPhoneNumberId.trim() && metaAccessToken.trim() ? "connected" : "disconnected",
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
        .select(EVOLUTION_USE_PROXY
          ? "id, instance_name, evolution_api_url, provider"
          : "id, instance_name, evolution_api_url, evolution_api_key, provider")
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      setInstanceName("");
      setShowForm(false);
      toast({
        title: "Instância criada",
        description: connectionProvider === "meta_cloud"
          ? "Conexão Meta salva. Configure o webhook e teste o envio."
          : "Clique em 'Mostrar QR Code' para conectar.",
      });
    },
    onError: () => toast({ title: "Erro ao criar instância", variant: "destructive" }),
  });

  const updateApiMutation = useMutation({
    mutationFn: async () => {
      const isMeta = connectionProvider === "meta_cloud";
      const { error } = await supabase
        .from("whatsapp_connections")
        .update({
          provider: connectionProvider,
          evolution_api_url: !isMeta ? apiUrl.trim() : null,
          evolution_api_key: !isMeta ? apiKey.trim() : null,
          meta_phone_number_id: isMeta ? metaPhoneNumberId.trim() || null : null,
          meta_waba_id: isMeta ? metaWabaId.trim() || null : null,
          meta_access_token: isMeta ? metaAccessToken.trim() || null : null,
          meta_default_template_name: isMeta ? metaDefaultTemplate.trim() || null : null,
        })
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      setShowApiConfig(false);
      toast({ title: "Configurações de API atualizadas" });
    },
    onError: () => toast({ title: "Erro ao atualizar API", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await (supabase as any)
        .from("whatsapp_connections")
        .select(EVOLUTION_USE_PROXY
          ? "id, instance_name, evolution_api_url, provider"
          : "id, instance_name, evolution_api_url, evolution_api_key, provider")
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
      setQrMap((m) => { const n = { ...m }; delete n[id]; return n; });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      toast({ title: "Instância removida" });
    },
  });

  // Fetch QR code from Evolution API
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
      // Evolution API returns base64 as "data:image/png;base64,..." or plain base64
      const src = data.base64.startsWith("data:") ? data.base64 : `data:image/png;base64,${data.base64}`;
      setQrMap((m) => ({ ...m, [conn.id]: src }));
      setCountdownMap((m) => ({ ...m, [conn.id]: 60 }));
      // Update status to "connecting" in DB
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

  // Poll connection state for instances showing QR
  const checkConnectionState = useCallback(async (conn: Connection) => {
    if (conn.provider === "meta_cloud") return;
    if (!conn.evolution_api_url || !conn.evolution_api_key) return;
    try {
      const state = await getConnectionStateForConnection(conn);
      const mapped = mapEvolutionState(state.state);
      if (mapped === "connected") {
        // Clear QR, update DB
        setQrMap((m) => { const n = { ...m }; delete n[conn.id]; return n; });
        await (supabase as any).from("whatsapp_connections").update({
          status: "connected",
          connected_at: new Date().toISOString(),
        }).eq("id", conn.id);
        // Best effort: auto-configure webhook after connection.
        try {
          const appUrl = import.meta.env.VITE_SUPABASE_URL || "";
          if (appUrl) {
            await setWebhookForConnection(conn, `${appUrl.replace(/\/$/, "")}/functions/v1/whatsapp-webhook`);
          }
        } catch {
          // silently ignore webhook auto-config failures
        }
        queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
        toast({ title: "WhatsApp conectado!", description: `Instância ${conn.instance_name} está ativa.` });
      }
    } catch {
      // ignore polling errors silently
    }
  }, [queryClient, toast]);

  // Auto-poll every 4s for connections with active QR
  useEffect(() => {
    const ids = Object.keys(qrMap);
    if (ids.length === 0) return;
    const interval = setInterval(() => {
      ids.forEach((id) => {
        const conn = connections.find((c) => c.id === id);
        if (conn) checkConnectionState(conn);
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [qrMap, connections, checkConnectionState]);

  // Countdown tick — decrement every second for active QRs
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

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp</h1>
          <p className="text-muted-foreground text-sm mt-1">Gerencie suas conexões do WhatsApp Business</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowApiConfig(!showApiConfig)} className="gap-2 border-primary/20 hover:bg-primary/5">
            <Settings className="w-4 h-4" />
            Configurar API
          </Button>
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nova instância
          </Button>
        </div>
      </div>

      {showApiConfig && (
        <Card className="p-6 space-y-4 border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary" />
            <h2 className="font-bold">Configuração WhatsApp</h2>
          </div>
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
                  placeholder="sua_chave_secreta"
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
                  placeholder="EAA..."
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
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => updateApiMutation.mutate()}
              disabled={
                updateApiMutation.isPending ||
                (connectionProvider === "evolution" && (!apiUrl || !apiKey)) ||
                (connectionProvider === "meta_cloud" && (!metaPhoneNumberId.trim() || !metaAccessToken.trim()))
              }
              className="gap-2"
            >
              {updateApiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Salvar Configurações
            </Button>
            <Button variant="ghost" onClick={() => setShowApiConfig(false)}>Cancelar</Button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            * Aplicado a todas as conexões desta conta. Meta: deploy de <code className="bg-muted px-0.5 rounded">meta-whatsapp-webhook</code> e <code className="bg-muted px-0.5 rounded">meta-whatsapp-send</code>. Guia: <code className="bg-muted px-0.5 rounded">docs/meta-whatsapp-cloud-setup.md</code>.
          </p>
        </Card>
      )}

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2">
          <h2 className="font-semibold">Nova instância WhatsApp</h2>
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
          <div className="flex gap-2">
            <Button 
              onClick={() => createMutation.mutate(instanceName)} 
              disabled={!instanceName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Criar instância
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setInstanceName(""); }}>Cancelar</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : connections.length === 0 ? (
        <div className="bg-card border rounded-xl p-10 text-center space-y-3">
          <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto">
            <WifiOff className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="font-medium">Nenhuma instância configurada</p>
          <p className="text-sm text-muted-foreground">Crie uma instância para conectar seu WhatsApp Business.</p>
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
            const hasApiConfig =
              conn.provider === "meta_cloud"
                ? !!(conn.meta_phone_number_id && conn.meta_access_token)
                : !!(conn.evolution_api_url && conn.evolution_api_key);
            const countdown = countdownMap[conn.id] ?? 0;
            const qrExpired = qr && countdown <= 0;

            return (
              <div key={conn.id} className="bg-card border rounded-xl p-5 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2 rounded-lg border",
                      conn.status === "connected" ? "border-green-200 bg-green-50" : "border-border bg-muted"
                    )}>
                      {conn.status === "connected"
                        ? <Wifi className="w-5 h-5 text-green-600" />
                        : <WifiOff className="w-5 h-5 text-muted-foreground" />
                      }
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

                {/* No API config warning */}
                {!hasApiConfig && conn.status !== "connected" && (
                  <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>
                      Configure a API em <strong>Configurar API</strong>
                      {conn.provider === "meta_cloud" ? " (Phone number ID + token)." : " para ativar o QR Code."}
                    </span>
                    <button
                      type="button"
                      className="ml-auto flex items-center gap-1 font-semibold hover:underline shrink-0 text-yellow-800"
                      onClick={() => setShowApiConfig(true)}
                    >
                      <Settings className="w-3 h-3" />
                      Abrir configuração
                    </button>
                  </div>
                )}

                {/* QR Code area — apenas Evolution; Meta Cloud não usa QR nesta tela */}
                {conn.provider !== "meta_cloud" && conn.status !== "connected" && hasApiConfig && (
                  <div className="border-t pt-4">
                    {qr ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          {qrExpired ? (
                            <>
                              <div className="w-2 h-2 rounded-full bg-red-400" />
                              <p className="text-sm font-medium text-red-600">QR Code expirado</p>
                            </>
                          ) : (
                            <>
                              <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                              <p className="text-sm font-medium text-yellow-700">
                                Aguardando leitura — <span className="font-black">{countdown}s</span>
                              </p>
                            </>
                          )}
                        </div>
                        <div className="flex gap-6 items-start">
                          {qrExpired ? (
                            <div className="w-44 h-44 border-4 border-red-100 rounded-xl bg-red-50 flex flex-col items-center justify-center gap-3">
                              <p className="text-xs font-bold text-red-500 text-center">QR expirado</p>
                              <Button size="sm" variant="outline" className="gap-2" onClick={() => fetchQR(conn)} disabled={loadingQR}>
                                {loadingQR ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                Gerar novo
                              </Button>
                            </div>
                          ) : (
                            <img
                              src={qr}
                              alt="QR Code WhatsApp"
                              className="w-44 h-44 border-4 border-white rounded-xl shadow-md"
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
                                {loadingQR
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <RefreshCw className="w-3.5 h-3.5" />
                                }
                                Atualizar QR
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <Button
                          size="sm"
                          className="gap-2"
                          onClick={() => fetchQR(conn)}
                          disabled={loadingQR}
                        >
                          {loadingQR
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <QrCode className="w-3.5 h-3.5" />
                          }
                          {loadingQR ? "Carregando QR Code…" : "Mostrar QR Code"}
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Escaneie com o WhatsApp Business para conectar
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Connected success */}
                {conn.provider === "meta_cloud" && hasApiConfig && (
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
                  </div>
                )}

                {conn.status === "connected" && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    Conectado desde {conn.connected_at
                      ? new Date(conn.connected_at).toLocaleDateString("pt-BR")
                      : "—"
                    }
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 justify-end border-t pt-3">
                  {conn.provider !== "meta_cloud" && conn.status !== "connected" && hasApiConfig && !qr && (
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
                    onClick={() => deleteMutation.mutate(conn.id)}
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
        <p className="text-xs"><strong>Evolution:</strong> use <strong>Configurar API</strong> (URL + chave), crie uma instância, <strong>Mostrar QR Code</strong> e aguarde a confirmação.</p>
        <p className="text-xs"><strong>Meta Cloud API:</strong> <strong>Configurar API</strong> (Phone number ID, token, template padrão). Copie a URL do webhook no próprio formulário Meta. Documentação: <code className="text-[10px] bg-background px-1 rounded border">docs/meta-whatsapp-cloud-setup.md</code>.</p>
      </div>
    </div>
  );
}
