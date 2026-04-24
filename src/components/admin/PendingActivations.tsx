import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Store, CheckCircle2, ExternalLink, Clock,
  MessageCircle, Sparkles, RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface PendingRow {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  plan: string | null;
  activation_requested_at: string | null;
  activation_message_sent_at: string | null;
  store_id: string | null;
  store_name: string | null;
  store_url: string | null;
  platform: string | null;
  store_phone: string | null;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMin = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  if (diffMin < 60) return `${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d`;
}

export function PendingActivations() {
  const queryClient = useQueryClient();
  const [confirmTarget, setConfirmTarget] = useState<PendingRow | null>(null);
  const [notes, setNotes] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-pending-activations"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("admin_get_pending_activations");
      if (error) throw error;
      return (data ?? []) as PendingRow[];
    },
    staleTime: 15_000,
  });

  const activate = useMutation({
    mutationFn: async ({ userId, notes }: { userId: string; notes: string }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("admin_activate_store", {
        target_user_id: userId,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Loja ativada — cliente liberado.");
      setConfirmTarget(null);
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["admin-pending-activations"] });
    },
    onError: (e: Error) => {
      toast.error("Não foi possível ativar", { description: e.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando lojas pendentes…
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              Lojas aguardando ativação ({rows.length})
            </CardTitle>
            <CardDescription>
              Clientes que pagaram e estão aguardando configuração da API oficial do WhatsApp.
              Configure as integrações e clique em <strong>Ativar loja</strong> para liberar o acesso.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2 font-bold"
          >
            <RefreshCcw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardHeader>
      </Card>

      {rows.length === 0 ? (
        <Card className="border-border/40">
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-3" />
            <p className="text-sm">Nenhuma loja pendente no momento. 🎉</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.user_id} className="border-border/60">
              <CardContent className="pt-6 pb-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Store className="w-4 h-4 text-primary shrink-0" />
                      <span className="font-black text-base truncate">
                        {row.store_name || row.company_name || "Loja sem nome"}
                      </span>
                      {row.platform && (
                        <Badge variant="outline" className="text-[9px]">{row.platform}</Badge>
                      )}
                      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[9px] uppercase tracking-widest">
                        {row.plan ?? "—"}
                      </Badge>
                      {row.activation_message_sent_at && (
                        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[9px] uppercase tracking-widest gap-1">
                          <MessageCircle className="w-3 h-3" />
                          Mensagem enviada
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <strong>{row.full_name ?? "—"}</strong> · {row.email ?? "—"}
                    </p>
                    {row.store_url && (
                      <a
                        href={row.store_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        {row.store_url} <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-end">
                      <Clock className="w-3.5 h-3.5" />
                      Aguardando há <strong className="text-foreground">{timeAgo(row.activation_requested_at)}</strong>
                    </div>
                    {row.activation_requested_at && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        {new Date(row.activation_requested_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/30">
                  {row.store_id && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="font-bold gap-2"
                    >
                      <Link to={`/dashboard/integracoes`} target="_blank" rel="noopener noreferrer">
                        Configurar integrações
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => { setConfirmTarget(row); setNotes(""); }}
                    className="font-bold gap-2 bg-emerald-500 hover:bg-emerald-600 text-white"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Ativar loja
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar loja</DialogTitle>
            <DialogDescription>
              Confirma a ativação de <strong>{confirmTarget?.store_name || confirmTarget?.company_name || "—"}</strong> ({confirmTarget?.email})?
              O cliente será liberado imediatamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="activation-notes">Notas internas (opcional)</Label>
            <Textarea
              id="activation-notes"
              placeholder="Ex.: Meta WhatsApp configurada; cliente confirmou recebimento de teste."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)} disabled={activate.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => confirmTarget && activate.mutate({ userId: confirmTarget.user_id, notes })}
              disabled={activate.isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold gap-2"
            >
              {activate.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Ativando…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Confirmar ativação</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}