import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, WifiOff, Plus, Trash2,
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
import { cn } from "@/lib/utils";
import {
  metaShowsWebhookHelp,
  shouldWarnIncompleteSetup,
} from "@/lib/whatsapp/connection-ui";
import { launchEmbeddedSignup } from "@/lib/whatsapp/meta-embedded-signup";
import { getMetaAppConfig } from "@/lib/whatsapp/meta-app-config";

type Connection = {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
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

function stringifyMetaError(err: unknown): string {
  if (!err) return "Erro desconhecido";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const anyErr = err as { message?: unknown; error?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error === "string") return anyErr.error;
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

async function invokeMetaVerify(connectionId: string): Promise<MetaVerifyResponse> {
  const { data, error } = await supabase.functions.invoke<MetaVerifyResponse>("meta-whatsapp-send", {
    body: { connectionId, kind: "verify" },
  });
  if (error) {
    // Try to read structured error body returned by the edge function
    let bodyMsg: string | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.text === "function") {
      try {
        const text = await ctx.text();
        try {
          const parsed = JSON.parse(text);
          bodyMsg = stringifyMetaError(parsed);
        } catch {
          bodyMsg = text;
        }
      } catch {
        // ignore
      }
    }
    return { ok: false, error: bodyMsg || error.message || "Falha ao chamar edge function" };
  }
  if (!data) return { ok: false, error: "Resposta vazia" };
  return { ...data, error: data.error ? stringifyMetaError(data.error) : data.error };
}

export default function WhatsApp() {
  const [showForm, setShowForm] = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaDefaultTemplate, setMetaDefaultTemplate] = useState("");
  const [selectedApiConnectionId, setSelectedApiConnectionId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [embeddedSignupLoading, setEmbeddedSignupLoading] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleEmbeddedSignup = useCallback(async () => {
    if (!selectedStoreId) {
      toast({ title: "Selecione uma loja primeiro", variant: "destructive" });
      return;
    }
    setEmbeddedSignupLoading(true);
    try {
      const cfg = await getMetaAppConfig();
      const result = await launchEmbeddedSignup({
        appId: cfg.appId,
        configId: cfg.configId,
        graphVersion: cfg.graphVersion,
        storeId: selectedStoreId,
      });
      if (result.ok) {
        toast({ title: "WhatsApp conectado!", description: result.display_phone_number ? `Número: ${result.display_phone_number}` : "Conexão criada automaticamente." });
        queryClient.invalidateQueries({ queryKey: ["whatsapp_bundle_v2"] });
        queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      } else {
        toast({ title: "Erro na conexão", description: result.error ?? "Tente novamente.", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Falha no Embedded Signup", variant: "destructive" });
    } finally {
      setEmbeddedSignupLoading(false);
    }
  }, [selectedStoreId, toast, queryClient]);

  const metaWebhookUrl = useMemo(() => {
    const raw = import.meta.env.VITE_SUPABASE_URL;
    if (!raw || typeof raw !== "string") return "";
    const base = raw.replace(/\/$/, "");
    return `${base}/functions/v1/meta-whatsapp-webhook`;
  }, []);




  const {
    data: lojas = [],
    isLoading: storeListLoading,
    isError: storesListError,
  } = useQuery({
    queryKey: ["whatsapp_page_stores", user?.id ?? ""],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name")
        .eq("user_id", user!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (storesListError) {
      toast({ title: "Não foi possível carregar as lojas", variant: "destructive" });
    }
  }, [storesListError, toast]);

  useEffect(() => {
    if (!lojas.length) {
      setSelectedStoreId("");
      return;
    }
    setSelectedStoreId((prev) => (prev && lojas.some((s) => s.id === prev) ? prev : lojas[0].id));
  }, [lojas]);

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
    data: bundle = { connections: [], health: { recent_errors: [], total_connected: 0 } },
    isLoading,
    isError,
    error: connectionsError,
    refetch: refetchConnections,
  } = useQuery({
    queryKey: ["whatsapp_bundle_v2", user?.id ?? "", selectedStoreId],
    queryFn: async () => {
      if (!selectedStoreId) return { connections: [], health: { recent_errors: [], total_connected: 0 } };
      
      const { data, error } = await supabase.rpc("get_whatsapp_bundle_v2", {
        p_store_id: selectedStoreId,
      });

      if (error) throw error;
      const res = data as {
        connections?: Connection[];
        health?: { recent_errors: unknown[]; total_connected: number };
      };
      return {
        connections: (res.connections || []) as Connection[],
        health: res.health || { recent_errors: [], total_connected: 0 },
      };
    },
    enabled: connectionsEnabled,
  });

  const connections = bundle.connections;
  const healthSummary = bundle.health;

  const apiFormHydrateKey = useMemo(() => {
    const c = connections.find((x) => x.id === selectedApiConnectionId);
    if (!c) return "";
    return [
      c.id,
      c.provider ?? "",
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

  /** Validate WhatsApp connection fields before sending to the database. */
  const validateConnectionForm = (): string | null => {
    const name = instanceName.trim();
    if (!name) return "O nome da instância é obrigatório.";
    if (name.length < 2) return "O nome da instância deve ter ao menos 2 caracteres.";
    const phoneId = metaPhoneNumberId.trim();
    if (phoneId && !/^\d{10,}$/.test(phoneId)) {
      return "O Phone Number ID deve conter apenas dígitos (ex: 123456789012345).";
    }
    const token = metaAccessToken.trim();
    if (token && token.length < 20) {
      return "O Access Token parece inválido — tokens Meta geralmente começam com 'EAA' e têm 100+ caracteres.";
    }
    return null;
  };

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const storeId = selectedStoreId || null;
      const row = {
        user_id: user!.id,
        store_id: storeId,
        instance_name: name.trim(),
        status: "disconnected" as const,
        provider: "meta_cloud" as const,
        meta_phone_number_id: metaPhoneNumberId.trim() || null,
        meta_waba_id: metaWabaId.trim() || null,
        meta_access_token: metaAccessToken.trim() || null,
        meta_default_template_name: metaDefaultTemplate.trim() || null,
      };
      const { data: inserted, error } = await supabase
        .from("whatsapp_connections")
        .insert(row)
        .select("id, instance_name, provider")
        .single();
      if (error) throw error;
      if (inserted?.id && metaPhoneNumberId.trim() && metaAccessToken.trim()) {
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
      queryClient.invalidateQueries({ queryKey: ["whatsapp_bundle_v2"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_status"] });
      setInstanceName("");
      setShowForm(false);
      toast({
        title: "Instância criada",
        description: "Configure o webhook no Meta e use «Validar com Meta» se necessário.",
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
      const patch: Record<string, unknown> = {
        provider: "meta_cloud",
        meta_phone_number_id: metaPhoneNumberId.trim() || null,
        meta_waba_id: metaWabaId.trim() || null,
        meta_default_template_name: metaDefaultTemplate.trim() || null,
      };
      if (metaAccessToken.trim()) {
        patch.meta_access_token = metaAccessToken.trim();
      }
      const { error } = await supabase
        .from("whatsapp_connections")
        .update(patch as any)
        .eq("id", connectionId)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_bundle_v2"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_status"] });
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
      queryClient.invalidateQueries({ queryKey: ["whatsapp_bundle_v2"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_status"] });
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
      const { error } = await supabase
        .from("whatsapp_connections")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_bundle_v2"] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections_status"] });
      toast({ title: "Instância removida" });
    },
    onError: (e: Error) =>
      toast({
        title: "Erro ao remover",
        description: e?.message ?? "Tente novamente.",
        variant: "destructive",
      }),
  });

  const selectedStoreLabel = lojas.find((s) => s.id === selectedStoreId)?.name ?? "";

  const canSaveApi = !!selectedApiConnectionId && !!metaPhoneNumberId.trim();

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
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={handleEmbeddedSignup}
              disabled={embeddedSignupLoading || !selectedStoreId}
              className="gap-2 bg-[#1877F2] hover:bg-[#166FE5] text-white"
            >
              {embeddedSignupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              )}
              Conectar com Facebook
            </Button>
            <Button variant="outline" onClick={toggleApiConfig} className="gap-2 border-primary/20 hover:bg-primary/5">
              <Settings className="w-4 h-4" />
              Configurar API
            </Button>
            <Button variant="secondary" onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Nova instância (manual)
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
          <p className="text-xs text-muted-foreground">
            Provedor: <strong>Meta — WhatsApp Cloud API</strong>
          </p>
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
          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => selectedApiConnectionId && updateApiMutation.mutate(selectedApiConnectionId)}
              disabled={!canSaveApi || updateApiMutation.isPending}
              className="gap-2"
            >
              {updateApiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Salvar nesta conexão
            </Button>
            {selectedApiConnectionId && (
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
          <p className="text-xs text-muted-foreground">
            Nova conexão usa <strong>Meta Cloud API</strong> (oficial).
          </p>
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
                  const validationError = validateConnectionForm();
                  if (validationError) {
                    toast({ title: "Dados inválidos", description: validationError, variant: "destructive" });
                    return;
                  }
                  createMutation.mutate(instanceName);
                }
              }}
            />
          </div>
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
                <Label htmlFor="create-meta-waba">WABA ID</Label>
                <Input
                  id="create-meta-waba"
                  placeholder="ID da WhatsApp Business Account"
                  value={metaWabaId}
                  onChange={(e) => setMetaWabaId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Encontre em Meta Business Manager → WhatsApp Accounts.
                </p>
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
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const validationError = validateConnectionForm();
                if (validationError) {
                  toast({ title: "Dados inválidos", description: validationError, variant: "destructive" });
                  return;
                }
                createMutation.mutate(instanceName);
              }}
              disabled={
                !instanceName.trim() ||
                createMutation.isPending ||
                !metaPhoneNumberId.trim() ||
                !metaAccessToken.trim()
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
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button
              onClick={handleEmbeddedSignup}
              disabled={embeddedSignupLoading || !selectedStoreId}
              className="gap-2 bg-[#1877F2] hover:bg-[#166FE5] text-white"
            >
              {embeddedSignupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              )}
              Conectar com Facebook
            </Button>
            <Button variant="outline" onClick={() => setShowForm(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Criar manualmente
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {(healthSummary?.recent_errors?.length ?? 0) > 0 && (
            <Card className="p-4 bg-muted/30 border border-border/50 rounded-xl">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="w-3 h-3 text-red-500" /> Logs de erro recentes
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {healthSummary?.recent_errors?.map((err: any) => (
                  <div key={err.id} className="p-2.5 bg-card border rounded-lg space-y-1">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-[8px] h-3.5 px-1 uppercase font-bold border border-red-500/20 text-red-600 bg-red-500/5 rounded">
                        {err.event_type.replace('whatsapp.', '')}
                      </span>
                      <span className="text-[8px] text-muted-foreground">
                        {new Date(err.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-[10px] font-medium leading-tight text-foreground truncate">
                      {err.error_message || "Erro no processamento"}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="space-y-3">
          {connections.map((conn) => {
            const cfg = STATUS_CONFIG[conn.status] ?? STATUS_CONFIG.disconnected;
            const showMetaWebhook = metaShowsWebhookHelp(conn);
            const warnSetup = shouldWarnIncompleteSetup(conn);

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
                          Meta Cloud
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {conn.phone_number ?? "Cloud API"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={cn("text-xs px-2 py-1 rounded-full border font-medium shrink-0", cfg.color)}>
                      {cfg.label}
                    </span>
                  </div>
                </div>

                {warnSetup && (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      Configure a API em <strong>Configurar API</strong>
                      {" (Phone number ID + token) e valide com Meta."}
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

                {showMetaWebhook && (
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
        </div>
      )}

      <div className="bg-muted/50 border rounded-xl p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Como conectar</p>
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
