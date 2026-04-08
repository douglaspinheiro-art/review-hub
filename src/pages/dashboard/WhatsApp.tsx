import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wifi, WifiOff, QrCode, Plus, Trash2, RefreshCw,
  Loader2, CheckCircle, AlertCircle, Settings, Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { getQRCode, getConnectionState, mapEvolutionState, setWebhook } from "@/lib/evolution-api";
import { cn } from "@/lib/utils";

type Connection = {
  id: string;
  instance_name: string;
  phone_number: string | null;
  status: "disconnected" | "connecting" | "connected" | "error";
  evolution_api_url: string | null;
  evolution_api_key: string | null;
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
  
  // qrMap: connId → base64 QR string
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [qrLoading, setQrLoading] = useState<Record<string, boolean>>({});
  // countdownMap: connId → seconds remaining (60→0)
  const [countdownMap, setCountdownMap] = useState<Record<string, number>>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["whatsapp_connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_connections")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Auto-set API URL/Key from first connection if available
      if (data && data.length > 0 && !apiUrl && !apiKey) {
        if (data[0].evolution_api_url) setApiUrl(data[0].evolution_api_url);
        if (data[0].evolution_api_key) setApiKey(data[0].evolution_api_key);
      }
      
      return data as unknown as Connection[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("whatsapp_connections").insert({
        user_id: user!.id,
        instance_name: name.trim(),
        status: "disconnected",
        evolution_api_url: apiUrl || null,
        evolution_api_key: apiKey || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp_connections"] });
      setInstanceName("");
      setShowForm(false);
      toast({ title: "Instância criada", description: "Clique em 'Mostrar QR Code' para conectar." });
    },
    onError: () => toast({ title: "Erro ao criar instância", variant: "destructive" }),
  });

  const updateApiMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("whatsapp_connections")
        .update({ 
          evolution_api_url: apiUrl.trim(), 
          evolution_api_key: apiKey.trim() 
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
    if (!conn.evolution_api_url || !conn.evolution_api_key) {
      toast({
        title: "Evolution API não configurada",
        description: "Configure a URL e chave da API em Configurações → WhatsApp API.",
        variant: "destructive",
      });
      return;
    }
    setQrLoading((m) => ({ ...m, [conn.id]: true }));
    try {
      const cfg = { baseUrl: conn.evolution_api_url, apiKey: conn.evolution_api_key };
      const data = await getQRCode(cfg, conn.instance_name);
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
    if (!conn.evolution_api_url || !conn.evolution_api_key) return;
    try {
      const cfg = { baseUrl: conn.evolution_api_url, apiKey: conn.evolution_api_key };
      const state = await getConnectionState(cfg, conn.instance_name);
      const mapped = mapEvolutionState(state.state);
      if (mapped === "connected") {
        // Clear QR, update DB
        setQrMap((m) => { const n = { ...m }; delete n[conn.id]; return n; });
        await (supabase.from("whatsapp_connections") as any).update({
          status: "connected",
          connected_at: new Date().toISOString(),
        }).eq("id", conn.id);
        // Best effort: auto-configure webhook after connection.
        try {
          const appUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "";
          if (appUrl) {
            await setWebhook(
              cfg,
              conn.instance_name,
              `${appUrl}/functions/v1/whatsapp-webhook`,
            );
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
            <h2 className="font-bold">Configuração Evolution API</h2>
          </div>
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
          <div className="flex gap-2 pt-2">
            <Button 
              onClick={() => updateApiMutation.mutate()} 
              disabled={updateApiMutation.isPending || !apiUrl || !apiKey}
              className="gap-2"
            >
              {updateApiMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Salvar Configurações
            </Button>
            <Button variant="ghost" onClick={() => setShowApiConfig(false)}>Cancelar</Button>
          </div>
          <p className="text-[10px] text-muted-foreground italic">
            * Estas configurações serão aplicadas a todas as instâncias desta conta.
          </p>
        </Card>
      )}

      {showForm && (
        <div className="bg-card border rounded-xl p-5 space-y-4 animate-in fade-in slide-in-from-top-2">
          <h2 className="font-semibold">Nova instância WhatsApp</h2>
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
            const hasApiConfig = !!(conn.evolution_api_url && conn.evolution_api_key);
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
                      <p className="font-medium">{conn.instance_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {conn.phone_number ?? "Número não conectado"}
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
                    <span>Configure a Evolution API em <strong>Configurações → WhatsApp API</strong> para ativar o QR Code.</span>
                    <a href="/dashboard/configuracoes" className="ml-auto flex items-center gap-1 font-semibold hover:underline shrink-0">
                      <Settings className="w-3 h-3" />
                      Configurar
                    </a>
                  </div>
                )}

                {/* QR Code area */}
                {conn.status !== "connected" && hasApiConfig && (
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
                  {conn.status !== "connected" && hasApiConfig && !qr && (
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

      <div className="bg-muted/50 border rounded-xl p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Como conectar seu WhatsApp</p>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Configure a Evolution API em <strong>Configurações → WhatsApp API</strong></li>
          <li>Crie uma instância acima</li>
          <li>Clique em <strong>Mostrar QR Code</strong> e escaneie com o celular</li>
          <li>Aguarde a confirmação automática de conexão</li>
        </ol>
      </div>
    </div>
  );
}
