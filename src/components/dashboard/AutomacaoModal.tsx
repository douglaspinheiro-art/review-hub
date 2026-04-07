import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronRight, ChevronLeft, Loader2, Check,
  UserPlus, ShoppingCart, Package, RefreshCcw, Gift, Zap, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ─── Tipos de gatilho disponíveis ────────────────────────────────────────────

const TRIGGER_OPTIONS = [
  {
    value: "new_contact",
    label: "Novo cliente",
    desc: "Quando um novo contato é adicionado",
    icon: UserPlus,
  },
  {
    value: "cart_abandoned",
    label: "Carrinho abandonado",
    desc: "Quando um carrinho fica inativo",
    icon: ShoppingCart,
  },
  {
    value: "order_delivered",
    label: "Pós-compra",
    desc: "Após entrega de um pedido",
    icon: Package,
  },
  {
    value: "customer_inactive",
    label: "Reativação",
    desc: "Clientes sem compra por muito tempo",
    icon: RefreshCcw,
  },
  {
    value: "customer_birthday",
    label: "Aniversário",
    desc: "No dia do aniversário do cliente",
    icon: Gift,
  },
  {
    value: "custom",
    label: "Personalizado",
    desc: "Disparado via webhook / API",
    icon: Zap,
  },
] as const;

type TriggerValue = typeof TRIGGER_OPTIONS[number]["value"];

// ─── Template variables ────────────────────────────────────────────────────

const TEMPLATE_VARS: { label: string; value: string }[] = [
  { label: "{{name}}", value: "{{name}}" },
  { label: "{{store_name}}", value: "{{store_name}}" },
  { label: "{{value}}", value: "{{value}}" },
  { label: "{{magic_link}}", value: "{{magic_link}}" },
  { label: "{{coupon}}", value: "{{coupon}}" },
];

const VAR_EXAMPLES: Record<string, string> = {
  "{{name}}": "Maria",
  "{{store_name}}": "Loja Exemplo",
  "{{value}}": "R$ 150,00",
  "{{magic_link}}": "https://loja.com/cart/abc123",
  "{{coupon}}": "VOLTE10",
};

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  trigger: z.enum([
    "new_contact", "cart_abandoned", "order_delivered",
    "customer_inactive", "customer_birthday", "custom",
  ]),
  delay_minutes: z.coerce.number().int().default(0),
  is_active: z.boolean().default(true),
  message_template: z.string().min(10, "Mensagem deve ter pelo menos 10 caracteres"),
});

type FormData = z.infer<typeof schema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDelay(minutes: number): string {
  if (minutes === 0) return "imediatamente";
  if (minutes < 0) {
    const days = Math.abs(Math.round(minutes / 1440));
    return `${days} dia${days !== 1 ? "s" : ""} antes`;
  }
  if (minutes < 60) return `${minutes} min após o gatilho`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h após o gatilho`;
  return `${Math.round(minutes / 1440)} dia${Math.round(minutes / 1440) !== 1 ? "s" : ""} após o gatilho`;
}

function renderPreview(template: string): string {
  return Object.entries(VAR_EXAMPLES).reduce(
    (msg, [key, val]) => msg.replaceAll(key, `*${val}*`),
    template,
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface AutomacaoModalProps {
  onClose: () => void;
}

export default function AutomacaoModal({ onClose }: AutomacaoModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger: triggerValidation,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      trigger: "cart_abandoned",
      delay_minutes: 60,
      is_active: true,
      message_template: "",
    },
  });

  const watchedTrigger = watch("trigger");
  const watchedMessage = watch("message_template");
  const watchedDelay = watch("delay_minutes");
  const watchedActive = watch("is_active");

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase.from("automations").insert({
        user_id: user!.id,
        name: data.name,
        trigger: data.trigger,
        message_template: data.message_template,
        delay_minutes: data.delay_minutes,
        is_active: data.is_active,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automations", user?.id] });
      toast.success("Jornada criada com sucesso!");
      onClose();
    },
    onError: (err: Error) => {
      toast.error(`Erro ao criar jornada: ${err.message}`);
    },
  });

  async function goToStep2() {
    const ok = await triggerValidation(["name", "trigger", "delay_minutes"]);
    if (ok) setStep(2);
  }

  function insertVar(varValue: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const current = watchedMessage;
    const next = current.slice(0, start) + varValue + current.slice(end);
    setValue("message_template", next, { shouldValidate: true });
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + varValue.length, start + varValue.length);
    }, 0);
  }

  const onSubmit = (data: FormData) => createMutation.mutate(data);

  const selectedTrigger = TRIGGER_OPTIONS.find((t) => t.value === watchedTrigger);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="font-black text-base">Nova Jornada Customizada</h2>
            <p className="text-xs text-muted-foreground">Passo {step} de 2</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex px-6 pt-4 gap-2 shrink-0">
          {[
            { n: 1, label: "Configuração" },
            { n: 2, label: "Mensagem" },
          ].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 transition-colors",
                step > n ? "bg-primary text-primary-foreground" :
                step === n ? "bg-primary text-primary-foreground" :
                "bg-muted text-muted-foreground"
              )}>
                {step > n ? <Check className="w-3 h-3" /> : n}
              </div>
              <span className={cn(
                "text-xs font-medium",
                step === n ? "text-foreground" : "text-muted-foreground"
              )}>{label}</span>
              {n < 2 && <div className={cn("flex-1 h-px", step > n ? "bg-primary" : "bg-muted")} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

            {/* ── Passo 1 ── */}
            {step === 1 && (
              <>
                {/* Nome */}
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-sm font-semibold">Nome da jornada</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Win-back Black Friday"
                    {...register("name")}
                    className={cn(errors.name && "border-destructive")}
                  />
                  {errors.name && (
                    <p className="text-xs text-destructive">{errors.name.message}</p>
                  )}
                </div>

                {/* Gatilho */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Tipo de gatilho</Label>
                  <div className="grid grid-cols-1 gap-2">
                    {TRIGGER_OPTIONS.map((t) => {
                      const Icon = t.icon;
                      const isSelected = watchedTrigger === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setValue("trigger", t.value as TriggerValue)}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-xl border text-left transition-all",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                            isSelected ? "bg-primary/10" : "bg-muted"
                          )}>
                            <Icon className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                          </div>
                          <div className="min-w-0">
                            <p className={cn("text-sm font-semibold", isSelected && "text-primary")}>{t.label}</p>
                            <p className="text-xs text-muted-foreground">{t.desc}</p>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-primary ml-auto shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Delay */}
                <div className="space-y-1.5">
                  <Label htmlFor="delay" className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    Delay de envio
                  </Label>
                  <Input
                    id="delay"
                    type="number"
                    step="1"
                    {...register("delay_minutes")}
                    className={cn(errors.delay_minutes && "border-destructive")}
                  />
                  <p className="text-xs text-muted-foreground">
                    Valor em minutos — <span className="font-medium text-foreground">{formatDelay(watchedDelay ?? 0)}</span>.
                    Use negativo para "antes do evento" (ex: -1440 = 1 dia antes).
                  </p>
                </div>

                {/* Ativar imediatamente */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold">Ativar imediatamente</p>
                    <p className="text-xs text-muted-foreground">A jornada começa a funcionar ao salvar</p>
                  </div>
                  <Switch
                    checked={watchedActive}
                    onCheckedChange={(v) => setValue("is_active", v)}
                  />
                </div>
              </>
            )}

            {/* ── Passo 2 ── */}
            {step === 2 && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm font-semibold">Mensagem</Label>
                  <p className="text-xs text-muted-foreground">
                    Gatilho: <span className="font-medium text-foreground">{selectedTrigger?.label}</span>
                    {" · "}Envio {formatDelay(watchedDelay ?? 0)}
                  </p>

                  {/* Chips de variáveis */}
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {TEMPLATE_VARS.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        onClick={() => insertVar(v.value)}
                        className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-mono hover:bg-primary/20 transition-colors border border-primary/20"
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>

                  <Textarea
                    ref={textareaRef}
                    placeholder={`Olá {{name}}, temos uma oferta especial para você! 🎁\n\nAcesse: {{magic_link}}`}
                    rows={6}
                    {...register("message_template")}
                    className={cn("font-mono text-sm resize-none", errors.message_template && "border-destructive")}
                  />
                  {errors.message_template && (
                    <p className="text-xs text-destructive">{errors.message_template.message}</p>
                  )}
                </div>

                {/* Preview */}
                {watchedMessage.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Preview</p>
                    <div className="bg-[#DCF8C6] dark:bg-[#005C4B] rounded-2xl rounded-tl-sm px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed max-w-[90%]">
                      {renderPreview(watchedMessage)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t shrink-0 gap-3">
            {step === 1 ? (
              <>
                <Button type="button" variant="outline" onClick={onClose} className="flex-1">
                  Cancelar
                </Button>
                <Button type="button" className="flex-1 gap-2" onClick={goToStep2}>
                  Próximo <ChevronRight className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" className="gap-2 flex-1" onClick={() => setStep(1)}>
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </Button>
                <Button
                  type="submit"
                  className="flex-1 gap-2"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Criando...</>
                  ) : (
                    <><Check className="w-4 h-4" /> Criar Jornada</>
                  )}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
