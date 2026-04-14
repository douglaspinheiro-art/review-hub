/**
 * Step 0 — Objective + Channel + Name selection.
 * Reads form state via useFormContext(); no form props needed.
 */
import { useFormContext } from "react-hook-form";
import { Zap, ShoppingCart, Trophy, Package, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CampaignFormData = {
  name: string;
  channel: "whatsapp" | "email" | "sms";
  objective: "recovery" | "rebuy" | "loyalty" | "lancamento";
  subject?: string;
  message: string;
  segment: "all" | "active" | "inactive" | "vip" | "cart_abandoned" |
    "rfm_champions" | "rfm_loyal" | "rfm_at_risk" | "rfm_lost" | "rfm_new";
  scheduled_at?: string;
  send_now: boolean;
  ai_context?: string;
  ai_tone: string;
  magic_link_product?: string;
  magic_link_coupon?: string;
};

const OBJECTIVES = [
  { value: "recovery",   label: "Recuperar Vendas",  desc: "Carrinhos e boletos abandonados.",          icon: Zap,         color: "text-amber-500" },
  { value: "rebuy",      label: "Gerar Recompra",    desc: "Estimular clientes a voltarem.",             icon: ShoppingCart, color: "text-primary" },
  { value: "loyalty",    label: "Fidelizar VIPs",    desc: "Ofertas exclusivas para melhores clientes.", icon: Trophy,       color: "text-purple-500" },
  { value: "lancamento", label: "Lançar Produto",    desc: "Divulgue produtos e novas coleções.",        icon: Package,      color: "text-pink-500" },
] as const;

interface Props {
  whatsappOnly?: boolean;
}

export function CampaignObjectiveStep({ whatsappOnly }: Props) {
  const { register, watch, setValue } = useFormContext<CampaignFormData>();
  const objective = watch("objective");
  const channel = watch("channel");

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2 text-center md:text-left">
        <h2 className="text-3xl font-black font-syne uppercase tracking-tighter italic">
          Qual o seu <span className="text-primary underline">Objetivo?</span>
        </h2>
        <p className="text-muted-foreground text-sm">O Claude 3.5 adaptará a inteligência com base na sua escolha.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {OBJECTIVES.map((obj) => (
          <button
            key={obj.value}
            type="button"
            onClick={() => setValue("objective", obj.value)}
            className={cn(
              "flex flex-col gap-4 p-6 rounded-[2rem] border-2 text-left transition-all group relative overflow-hidden",
              objective === obj.value
                ? "border-primary bg-primary/5 ring-8 ring-primary/5"
                : "border-border/50 hover:border-primary/30"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
              objective === obj.value
                ? "bg-primary text-white scale-110 shadow-lg"
                : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
            )}>
              <obj.icon className="w-6 h-6" />
            </div>
            <div>
              <h4 className={cn("font-black text-sm uppercase tracking-tight", objective === obj.value ? "text-primary" : "text-foreground")}>
                {obj.label}
              </h4>
              <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed font-medium">{obj.desc}</p>
            </div>
            {objective === obj.value && (
              <div className="absolute top-0 right-0 p-4">
                <Check className="w-4 h-4 text-primary" />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-4 pt-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Nome da Campanha &amp; Canal</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            placeholder="ex: Recuperação de Inverno"
            {...register("name")}
            className="h-14 rounded-2xl bg-muted/30 border-none font-bold text-sm px-6"
          />
          {whatsappOnly ? (
            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-left space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-green-600">Canal: WhatsApp</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                E-mail é enviado pela área <strong className="text-foreground">Newsletter</strong>. SMS seguirá em versões futuras.
              </p>
            </div>
          ) : (
            <div className="flex bg-muted/30 p-1 rounded-2xl">
              {(["whatsapp", "email", "sms"] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setValue("channel", ch)}
                  className={cn(
                    "flex-1 h-12 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                    channel === ch ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:bg-background/50"
                  )}
                >
                  {ch}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
