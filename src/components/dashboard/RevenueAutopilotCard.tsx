import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Loader2, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useLoja } from "@/hooks/useConvertIQ";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Goal = { id?: string; goal_brl: number; autopilot_enabled: boolean };

function monthStartISO(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default function RevenueAutopilotCard() {
  const loja = useLoja();
  const { user } = useAuth();
  const storeId = (loja.data as { id?: string } | null)?.id ?? null;
  const qc = useQueryClient();
  const [draft, setDraft] = useState<string>("");

  const { data: goal, isLoading } = useQuery({
    queryKey: ["revenue-goal", storeId, monthStartISO()],
    enabled: !!storeId,
    queryFn: async (): Promise<Goal | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("revenue_goals")
        .select("id,goal_brl,autopilot_enabled")
        .eq("store_id", storeId)
        .eq("month_start", monthStartISO())
        .maybeSingle();
      return (data as Goal) ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async (payload: { goal_brl: number; autopilot_enabled: boolean }) => {
      if (!storeId || !user) throw new Error("missing store");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("revenue_goals").upsert(
        {
          store_id: storeId,
          user_id: user.id,
          month_start: monthStartISO(),
          goal_brl: payload.goal_brl,
          autopilot_enabled: payload.autopilot_enabled,
        },
        { onConflict: "store_id,month_start" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenue-goal", storeId, monthStartISO()] });
      toast.success("Meta atualizada");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-5 flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currentGoal = goal?.goal_brl ?? 0;
  const autopilotOn = goal?.autopilot_enabled ?? false;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", autopilotOn ? "bg-emerald-500/15" : "bg-muted")}>
            <Target className={cn("w-4 h-4", autopilotOn ? "text-emerald-500" : "text-muted-foreground")} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Meta de receita do mês</p>
        </div>
        {autopilotOn && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500">
            <Zap className="w-3 h-3" /> AUTOPILOT
          </span>
        )}
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-3xl font-extrabold font-mono tabular-nums">
          R$ {currentGoal.toLocaleString("pt-BR")}
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Nova meta (R$)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-9"
          />
          <Button
            size="sm"
            className="h-9"
            disabled={!draft || save.isPending}
            onClick={() => save.mutate({ goal_brl: Number(draft), autopilot_enabled: autopilotOn })}
          >
            Salvar
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="autopilot" className="text-xs font-bold">Piloto automático</Label>
            <p className="text-[10px] text-muted-foreground">Dispara prescrições se receita ficar atrás da meta</p>
          </div>
          <Switch
            id="autopilot"
            checked={autopilotOn}
            disabled={currentGoal <= 0 || save.isPending}
            onCheckedChange={(checked) => save.mutate({ goal_brl: currentGoal, autopilot_enabled: checked })}
          />
        </div>
      </div>
    </div>
  );
}