import { useQuery } from "@tanstack/react-query";
import { Calendar, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CalEvent = { event_date: string; event_name: string; category: string; prep_window_days: number };

const CAT_TONE: Record<string, string> = {
  sales: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30",
  family: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30",
  romantic: "bg-pink-500/10 text-pink-700 dark:text-pink-300 border-pink-500/30",
  awareness: "bg-primary/10 text-primary border-primary/20",
};

function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00Z").getTime();
  return Math.ceil((d - Date.now()) / 86_400_000);
}

export default function ProactiveCalendarWidget() {
  const navigate = useNavigate();
  const { data: events, isLoading } = useQuery({
    queryKey: ["commercial-calendar-upcoming"],
    staleTime: 60 * 60_000,
    queryFn: async (): Promise<CalEvent[]> => {
      const today = new Date().toISOString().slice(0, 10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("commercial_calendar_br")
        .select("event_date,event_name,category,prep_window_days")
        .gte("event_date", today)
        .order("event_date", { ascending: true })
        .limit(3);
      if (error) throw error;
      return (data ?? []) as CalEvent[];
    },
  });

  if (isLoading || !events || events.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calendar className="w-4 h-4 text-primary" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">Próximas oportunidades</p>
        </div>
      </div>
      <ul className="space-y-2.5">
        {events.map((e) => {
          const days = daysUntil(e.event_date);
          const inWindow = days <= e.prep_window_days;
          const tone = CAT_TONE[e.category] ?? CAT_TONE.awareness;
          return (
            <li key={`${e.event_date}-${e.event_name}`} className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate">{e.event_name}</p>
                <p className="text-xs text-muted-foreground">
                  Em {days} {days === 1 ? "dia" : "dias"} · prep ideal {e.prep_window_days}d
                </p>
              </div>
              <span className={cn("text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full border", tone)}>
                {inWindow ? "agir agora" : "futuro"}
              </span>
            </li>
          );
        })}
      </ul>
      <Button
        size="sm"
        variant="ghost"
        className="mt-3 h-8 w-full justify-between text-xs"
        onClick={() => navigate("/dashboard/campanhas")}
      >
        Criar campanha sazonal <ArrowRight className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}