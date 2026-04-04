import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Key, Plus, Copy, Trash2, Eye, EyeOff, Check,
  Shield, Clock, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type ApiKey = {
  id: string;
  name: string;
  key_prefix: string;
  key_preview: string;
  environment: "production" | "sandbox";
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
};

/** SHA-256 hash via Web Crypto (non-reversible) */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Generates a random API key (client-side — in prod, move generation to an Edge Function) */
async function generateKey(env: "production" | "sandbox"): Promise<{ full: string; preview: string; prefix: string; hash: string }> {
  const prefix = env === "production" ? "chb_live_" : "chb_test_";
  const random = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  const full = `${prefix}${random}`;
  const preview = `${prefix}${"•".repeat(20)}${random.slice(-6)}`;
  const hash = await sha256(full);
  return { full, preview, prefix, hash };
}

export default function ApiKeys() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [env, setEnv] = useState<"production" | "sandbox">("production");
  const [newKeyFull, setNewKeyFull] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api_keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) return [] as ApiKey[];
      return (data ?? []) as ApiKey[];
    },
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { full, preview, prefix, hash } = await generateKey(env);
      const { error } = await supabase.from("api_keys").insert({
        user_id: user!.id,
        name: newKeyName.trim(),
        key_prefix: prefix,
        key_hash: hash,
        key_preview: preview,
        environment: env,
        scopes: ["read", "write"],
        is_active: true,
      });
      if (error) throw error;
      return full;
    },
    onSuccess: (full) => {
      setNewKeyFull(full);
      setNewKeyName("");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["api_keys"] });
    },
    onError: () => toast({ title: "Erro ao criar API key", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api_keys"] }),
  });

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const ENDPOINTS = [
    { method: "GET",    path: "/v1/contacts",           desc: "Listar contatos" },
    { method: "POST",   path: "/v1/contacts",           desc: "Criar contato" },
    { method: "GET",    path: "/v1/campaigns",          desc: "Listar campanhas" },
    { method: "POST",   path: "/v1/campaigns/send",     desc: "Disparar campanha" },
    { method: "POST",   path: "/v1/messages/send",      desc: "Enviar mensagem individual" },
    { method: "GET",    path: "/v1/analytics",          desc: "Métricas e analytics" },
    { method: "POST",   path: "/v1/webhooks/cart",      desc: "Webhook de carrinho abandonado" },
    { method: "POST",   path: "/v1/reviews/request",    desc: "Solicitar avaliação Google" },
  ];

  const METHOD_COLOR: Record<string, string> = {
    GET:    "bg-blue-50 text-blue-700 border-blue-200",
    POST:   "bg-green-50 text-green-700 border-green-200",
    PUT:    "bg-yellow-50 text-yellow-700 border-yellow-200",
    DELETE: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">API & Integrações</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerencie suas chaves de API e integre o LTV Boost com qualquer sistema
        </p>
      </div>

      {/* Chave recém-criada */}
      {newKeyFull && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
            <Check className="w-4 h-4" />
            API key criada — copie agora, ela não será exibida novamente
          </div>
          <div className="flex gap-2">
            <Input value={newKeyFull} readOnly className="font-mono text-xs bg-white" />
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 gap-1.5"
              onClick={() => copyText(newKeyFull, "new")}
            >
              {copied === "new" ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === "new" ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setNewKeyFull(null)}>Entendi, fechar</Button>
        </div>
      )}

      {/* API Keys */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-primary" />
            <h2 className="font-semibold">Chaves de API</h2>
          </div>
          <Button size="sm" className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="w-3.5 h-3.5" />
            Nova chave
          </Button>
        </div>

        {showForm && (
          <div className="px-5 py-4 border-b bg-muted/30 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nome da chave</Label>
                <Input
                  placeholder="ex: Integração Shopify"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newKeyName.trim() && createMutation.mutate()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ambiente</Label>
                <select
                  value={env}
                  onChange={(e) => setEnv(e.target.value as "production" | "sandbox")}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="production">Produção</option>
                  <option value="sandbox">Sandbox (testes)</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => createMutation.mutate()}
                disabled={!newKeyName.trim() || createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Gerar chave
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Key className="w-8 h-8 opacity-20" />
            <p className="text-sm">Nenhuma API key criada</p>
          </div>
        ) : (
          <div className="divide-y">
            {keys.map((k) => (
              <div key={k.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{k.name}</p>
                    <Badge variant="outline" className={cn("text-xs",
                      k.environment === "production"
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {k.environment === "production" ? "Produção" : "Sandbox"}
                    </Badge>
                    {!k.is_active && (
                      <Badge variant="outline" className="text-xs bg-red-50 text-red-600 border-red-200">Revogada</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-muted-foreground font-mono">
                      {showKey[k.id] ? k.key_preview : k.key_preview.replace(/chb_(live|test)_/, (m) => m)}
                    </code>
                    <button
                      onClick={() => setShowKey((s) => ({ ...s, [k.id]: !s[k.id] }))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      {showKey[k.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Criada {new Date(k.created_at).toLocaleDateString("pt-BR")}
                    </span>
                    {k.last_used_at && (
                      <span>Último uso {new Date(k.last_used_at).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => copyText(k.key_preview, k.id)}
                  >
                    {copied === k.id ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(k.id)}
                    disabled={!k.is_active}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Endpoints */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Endpoints disponíveis</h2>
        </div>
        <div className="divide-y">
          {ENDPOINTS.map((ep) => (
            <div key={ep.path} className="px-5 py-3 flex items-center gap-3">
              <Badge variant="outline" className={cn("text-xs font-mono shrink-0 w-14 justify-center", METHOD_COLOR[ep.method])}>
                {ep.method}
              </Badge>
              <code className="text-sm font-mono text-muted-foreground flex-1">{ep.path}</code>
              <span className="text-xs text-muted-foreground hidden sm:block">{ep.desc}</span>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
          <span>Base URL: <code className="font-mono">https://api.LTV Boost.com</code></span>
          <a href="/documentacao" className="text-primary hover:underline">Ver documentação completa →</a>
        </div>
      </div>

      {/* Auth example */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Exemplo de autenticação</h2>
        </div>
        <div className="p-5">
          <pre className="bg-muted rounded-lg p-4 text-xs font-mono overflow-x-auto text-muted-foreground">
{`curl -X GET https://api.LTV Boost.com/v1/contacts \\
  -H "Authorization: Bearer chb_live_sua_api_key" \\
  -H "Content-Type: application/json"`}
          </pre>
        </div>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-sm">
        <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          <strong className="text-foreground">Nunca compartilhe suas chaves de API.</strong>{" "}
          Se uma chave for comprometida, revogue-a imediatamente e crie uma nova.
          Use variáveis de ambiente para armazenar chaves em produção.
        </p>
      </div>
    </div>
  );
}
