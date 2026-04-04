import { Construction, Clock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function TelaManutencao({ mensagem }: { mensagem?: string }) {
  return (
    <div className="min-h-screen bg-[#0A0A0F] text-white flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-8 animate-in fade-in zoom-in duration-500">
        <div className="relative mx-auto w-24 h-24 bg-amber-500/10 rounded-3xl flex items-center justify-center border border-amber-500/20">
          <Construction className="w-12 h-12 text-amber-500 animate-bounce" />
          <div className="absolute -top-2 -right-2 bg-amber-500 text-black text-[10px] font-black px-2 py-0.5 rounded-full">LIVE</div>
        </div>

        <div className="space-y-3">
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase italic">Manutenção em curso</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {mensagem || "Estamos realizando uma atualização crítica em nossos servidores de IA. Voltamos em alguns minutos!"}
          </p>
        </div>

        <div className="bg-[#13131A] border border-[#1E1E2E] rounded-2xl p-4 flex items-center gap-4 text-left">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-bold">Previsão de Retorno</p>
            <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Hoje • Próximos 30 minutos</p>
          </div>
        </div>

        <div className="pt-4 flex flex-col gap-3">
          <Button variant="outline" className="h-12 rounded-xl font-bold border-[#1E1E2E] gap-2">
            <MessageSquare className="w-4 h-4" /> Suporte via WhatsApp
          </Button>
          <p className="text-[9px] text-muted-foreground uppercase font-black tracking-[0.2em]">LTV BOOST • Conversion OS</p>
        </div>
      </div>
    </div>
  );
}
