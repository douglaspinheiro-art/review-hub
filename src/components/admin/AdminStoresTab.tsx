import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Store as StoreIcon, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useStoreScope } from "@/contexts/StoreScopeContext";
import { toast } from "sonner";

type AdminStoreRow = {
  store_id: string;
  store_name: string | null;
  store_user_id: string;
  user_email: string | null;
  user_full_name: string | null;
  plan: string | null;
  subscription_status: string | null;
  onboarding_completed: boolean | null;
  store_created_at: string;
};

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useMemo(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function AdminStoresTab() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);
  const { adminEnterStore } = useStoreScope();
  const navigate = useNavigate();
  const [enteringId, setEnteringId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-list-stores", debounced],
    queryFn: async (): Promise<AdminStoreRow[]> => {
      const trimmed = debounced.trim();
      const { data, error } = await supabase.rpc("admin_list_stores", {
        p_search: trimmed || undefined,
      });
      if (error) throw error;
      return (data ?? []) as AdminStoreRow[];
    },
    staleTime: 30_000,
  });

  const handleEnter = async (row: AdminStoreRow) => {
    setEnteringId(row.store_id);
    try {
      await adminEnterStore(row.store_id);
      toast.success(`Entrou na loja ${row.store_name ?? row.store_id}`, {
        description: "Modo somente leitura. Ative o modo edição no banner para alterar dados.",
      });
      navigate("/dashboard");
    } catch (e) {
      toast.error("Falha ao entrar na loja", { description: (e as Error).message });
    } finally {
      setEnteringId(null);
    }
  };

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <StoreIcon className="w-5 h-5 text-primary" />
          Lojas da plataforma
        </CardTitle>
        <CardDescription>
          Entre como admin no dashboard de qualquer loja para suporte. Toda sessão é registrada
          em <code className="text-xs">audit_logs</code> e expira em 1 hora.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome da loja ou e-mail do dono…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando lojas…
          </div>
        ) : error ? (
          <div className="text-sm text-destructive py-4">
            Erro: {(error as Error).message}{" "}
            <Button variant="link" size="sm" onClick={() => void refetch()}>tentar novamente</Button>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center border border-dashed rounded-lg">
            Nenhuma loja encontrada.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-bold">Loja</th>
                  <th className="text-left px-3 py-2 font-bold">Dono</th>
                  <th className="text-left px-3 py-2 font-bold">Plano</th>
                  <th className="text-left px-3 py-2 font-bold">Status</th>
                  <th className="text-left px-3 py-2 font-bold">Onboarding</th>
                  <th className="text-left px-3 py-2 font-bold">Criada em</th>
                  <th className="text-right px-3 py-2 font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.store_id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="px-3 py-2 font-bold">{row.store_name ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{row.user_full_name ?? "—"}</span>
                        <span className="text-xs">{row.user_email ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="uppercase text-[10px]">{row.plan ?? "—"}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={row.subscription_status === "active" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {row.subscription_status ?? "—"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {row.onboarding_completed ? (
                        <span className="text-emerald-500 text-xs font-bold">✓ Concluído</span>
                      ) : (
                        <span className="text-amber-500 text-xs font-bold">Pendente</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {new Date(row.store_created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        size="sm"
                        onClick={() => void handleEnter(row)}
                        disabled={enteringId === row.store_id}
                        className="gap-1"
                      >
                        {enteringId === row.store_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-3.5 h-3.5" />
                        )}
                        Entrar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default AdminStoresTab;