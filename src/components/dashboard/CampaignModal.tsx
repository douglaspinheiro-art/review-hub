import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, ChevronRight, ChevronLeft, Loader2, Check, Sparkles, ChevronDown,
  FlaskConical, Sliders, Users, MessageCircle, Mail, Smartphone,
  Monitor, Smartphone as SmartphoneIcon, Trophy, Clock, Search,
  Zap, AlertCircle, Eye, Info, User, Megaphone, CalendarDays, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STEPS = ["Mensagem", "Segmentação", "Agendamento"];

const schema = z.object({
  name: z.string().min(3, "Nome deve ter pelo menos 3 caracteres"),
  channel: z.enum(["whatsapp", "email", "sms"]).default("whatsapp"),
  subject: z.string().optional(),
  message: z.string().min(10, "Mensagem deve ter pelo menos 10 caracteres").max(1024, "Limite de 1024 caracteres"),
  segment: z.enum(["all", "active", "inactive", "vip", "cart_abandoned"]),
  scheduled_at: z.string().optional(),
  send_now: z.boolean().default(true),
  ab_enabled: z.boolean().default(false),
  message_b: z.string().optional(),
  ab_split: z.number().min(10).max(90).default(50),
  ai_context: z.string().optional(),
  ai_tone: z.string().default("friendly"),
}).superRefine((data, ctx) => {
  if (!data.send_now && !data.scheduled_at) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe a data e hora de envio", path: ["scheduled_at"] });
  }
  if (data.ab_enabled && (!data.message_b || data.message_b.length < 10)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Mensagem B deve ter pelo menos 10 caracteres", path: ["message_b"] });
  }
  if (data.channel === "email" && (!data.subject || data.subject.trim().length < 3)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Assunto é obrigatório para campanhas de e-mail", path: ["subject"] });
  }
  if (data.channel === "sms" && data.message.length > 160) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "SMS limitado a 160 caracteres", path: ["message"] });
  }
});

type FormData = z.infer<typeof schema>;

const CHANNELS = [
  {
    value: "whatsapp" as const,
    label: "WhatsApp",
    description: "Mensagem instantânea via WhatsApp",
    icon: MessageCircle,
    color: "text-green-600",
    bg: "bg-green-500/10 border-green-500/30",
    activeBg: "border-green-600 bg-green-500/15",
  },
  {
    value: "email" as const,
    label: "E-mail",
    description: "Campanha com assunto e corpo",
    icon: Mail,
    color: "text-blue-600",
    bg: "bg-blue-500/10 border-blue-500/30",
    activeBg: "border-blue-600 bg-blue-500/15",
  },
  {
    value: "sms" as const,
    label: "SMS",
    description: "Mensagem de texto (até 160 chars)",
    icon: Smartphone,
    color: "text-orange-600",
    bg: "bg-orange-500/10 border-orange-500/30",
    activeBg: "border-orange-600 bg-orange-500/15",
  },
] as const;

const SEGMENTS = [
  { value: "all",            label: "Todos os contatos",   description: "Envia para toda a base" },
  { value: "active",         label: "Clientes ativos",     description: "Compraram nos últimos 30 dias" },
  { value: "inactive",       label: "Clientes inativos",   description: "Sem compra nos últimos 60 dias" },
  { value: "vip",            label: "Clientes VIP",        description: "Top 20% por valor gasto" },
  { value: "cart_abandoned", label: "Carrinho abandonado", description: "Abandonaram nos últimos 7 dias" },
] as const;

const AI_TONES = [
  { value: "friendly",  label: "Amigável" },
  { value: "urgent",    label: "Urgente" },
  { value: "exclusive", label: "Exclusivo" },
  { value: "humorous",  label: "Bem-humorado" },
];

function CharacterCounter({ current, limit }: { current: number; limit: number }) {
  const percentage = Math.min((current / limit) * 100, 100);
  const color = percentage > 90 ? "text-red-500" : percentage > 75 ? "text-orange-500" : "text-primary";
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center w-6 h-6">
      <svg className="w-full h-full transform -rotate-90">
        <circle
          cx="12" cy="12" r={radius}
          className="stroke-muted" strokeWidth="2" fill="transparent"
        />
        <circle
          cx="12" cy="12" r={radius}
          className={cn("transition-all duration-300", color)}
          strokeWidth="2" fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke="currentColor"
        />
      </svg>
      {percentage >= 90 && (
        <span className="absolute text-[8px] font-bold">{limit - current}</span>
      )}
    </div>
  );
}

function iPhoneMockup({ channel, message, subject }: { channel: string; message: string; subject?: string }) {
  return (
    <div className="hidden lg:flex flex-col items-center justify-center p-8 bg-muted/30 border-l w-[340px] shrink-0">
      <div className="relative w-full aspect-[9/18.5] bg-[#111] rounded-[3rem] p-3 shadow-2xl ring-4 ring-gray-800">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-20 flex items-center justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-gray-900" />
          <div className="w-12 h-1 bg-gray-900 rounded-full" />
        </div>

        {/* Screen */}
        <div className="w-full h-full bg-[#f0f0f0] rounded-[2.2rem] overflow-hidden flex flex-col relative">
          {channel === "email" ? (
            <div className="flex-1 flex flex-col bg-white">
              <div className="h-16 bg-muted/20 border-b flex items-center gap-3 px-4 pt-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">LB</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold truncate">LTV Boost</p>
                  <p className="text-[8px] text-muted-foreground truncate">Para: Cliente</p>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <h1 className="text-xs font-bold leading-tight">{subject || "Assunto do e-mail"}</h1>
                <div className="text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
                  {message || "O corpo do seu e-mail aparecerá aqui..."}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="h-14 bg-white/80 backdrop-blur-md border-b flex items-center gap-3 px-4 pt-4 shrink-0">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold truncate">LTV Boost</p>
                  <p className="text-[8px] text-green-500 font-medium">online</p>
                </div>
              </div>

              {/* Chat Area */}
              <div className="flex-1 p-4 flex flex-col justify-end">
                <div className="flex flex-col gap-1 items-start max-w-[85%]">
                  <div className="bg-white rounded-2xl rounded-tl-none px-3 py-2 shadow-sm text-[11px] relative leading-relaxed">
                    <div className="absolute top-0 -left-1 w-2 h-2 bg-white" style={{ clipPath: 'polygon(100% 0, 0 0, 100% 100%)' }} />
                    <p className="whitespace-pre-wrap">{message || (channel === "whatsapp" ? "Sua mensagem do WhatsApp..." : "Sua mensagem de SMS...")}</p>
                    <p className="text-[8px] text-muted-foreground text-right mt-1">
                      {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Input Area */}
              <div className="h-12 bg-white/80 backdrop-blur-md border-t flex items-center gap-2 px-3 pb-2 shrink-0">
                <div className="flex-1 h-7 bg-muted rounded-full" />
                <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <SmartphoneIcon className="w-3 h-3" /> Preview em tempo real
      </p>
    </div>
  );
}

interface AiVariation { label: string; text: string; }
interface Props { onClose: () => void; }

export default function CampaignModal({ onClose }: Props) {
  const [step, setStep] = useState(0);
  const [showAI, setShowAI] = useState(false);
  const [aiTarget, setAiTarget] = useState<"a" | "b">("a");
  const [aiVariations, setAiVariations] = useState<AiVariation[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [segmentCounts, setSegmentCounts] = useState<Record<string, number | null>>({});
  const [countsLoading, setCountsLoading] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, watch, setValue, trigger, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { channel: "whatsapp", segment: "all", send_now: true, ab_enabled: false, ab_split: 50, ai_tone: "friendly" },
  });

  const sendNow   = watch("send_now");
  const channel   = watch("channel");
  const message   = watch("message") ?? "";
  const messageB  = watch("message_b") ?? "";
  const abEnabled = watch("ab_enabled");
  const abSplit   = watch("ab_split");

  const msgLimit = channel === "sms" ? 160 : 1024;
  const msgWarning = channel === "sms" ? 140 : 900;

  useEffect(() => {
    if (step !== 1) return;
    setCountsLoading(true);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }).neq("status", "blocked"),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("status", "inactive"),
      supabase.from("abandoned_carts").select("id", { count: "exact", head: true }).eq("status", "open").gte("created_at", since7d),
    ]).then(([allRes, activeRes, inactiveRes, cartsRes]) => {
      const total = allRes.count ?? 0;
      setSegmentCounts({
        all: total,
        active: activeRes.count ?? 0,
        inactive: inactiveRes.count ?? 0,
        vip: Math.ceil(total * 0.2),
        cart_abandoned: cartsRes.count ?? 0,
      });
      setCountsLoading(false);
    }).catch(() => setCountsLoading(false));
  }, [step]);

  async function goToStep(targetStep: number) {
    if (targetStep === step) return;
    
    // Moving forward: validate current step
    if (targetStep > step) {
      let valid = true;
      // We must validate step by step up to target
      for (let i = step; i < targetStep; i++) {
        if (i === 0) {
          const fields: (keyof FormData)[] = ["name", "channel", "message"];
          if (channel === "email") fields.push("subject");
          if (abEnabled) fields.push("message_b");
          valid = await trigger(fields);
        }
        if (!valid) break;
      }
      if (valid) setStep(targetStep);
    } else {
      // Moving backward: always allowed
      setStep(targetStep);
    }
  }

  async function nextStep() {
    await goToStep(step + 1);
  }

  function prevStep() { setStep((s) => Math.max(s - 1, 0)); }

  async function generateAiCopy() {
    const context = watch("ai_context");
    if (!context?.trim()) {
      toast({ title: "Informe o contexto da campanha", description: "Ex: promoção de Páscoa com 20% OFF", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiVariations([]);
    try {
      const { data, error } = await supabase.functions.invoke("ai-copy", {
        body: { context: context.trim(), segment: watch("segment"), tone: watch("ai_tone"), count: abEnabled ? 4 : 3 },
      });
      if (error) throw error;
      setAiVariations((data as { variations: AiVariation[] }).variations ?? []);
    } catch (err) {
      toast({ title: "Erro ao gerar cópias", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  }

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const base = {
        user_id: user!.id,
        name: data.name,
        channel: data.channel,
        subject: data.channel === "email" ? (data.subject ?? null) : null,
        message: data.message,
        segment: data.segment,
        status: data.send_now ? "running" : "scheduled",
        scheduled_at: data.send_now ? null : data.scheduled_at ?? null,
        total_contacts: 0, sent_count: 0, delivered_count: 0, read_count: 0, reply_count: 0,
      } as const;

      const { data: campaign, error: campError } = await supabase.from("campaigns").insert(base).select("id").single();
      if (campError) throw campError;

      if (data.ab_enabled && data.message_b) {
        const { data: campaignB, error: campBError } = await supabase.from("campaigns")
          .insert({ ...base, name: `${data.name} — Variante B`, message: data.message_b })
          .select("id").single();
        if (campBError) throw campBError;

        const { data: abTest, error: abError } = await supabase.from("ab_tests").insert({
          user_id: user!.id, name: data.name,
          variant_a_id: campaign.id, variant_b_id: campaignB.id,
          split_pct: data.ab_split, winner_metric: "read_rate", decide_after_hours: 4,
        }).select("id").single();
        if (abError) throw abError;

        await Promise.all([
          supabase.from("campaigns").update({ ab_test_id: abTest.id, ab_variant: "a" }).eq("id", campaign.id),
          supabase.from("campaigns").update({ ab_test_id: abTest.id, ab_variant: "b" }).eq("id", campaignB.id),
        ]);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      toast({ title: "Campanha criada!", description: abEnabled ? "Teste A/B configurado com sucesso." : "Sua campanha foi salva com sucesso." });
      onClose();
    },
    onError: () => toast({ title: "Erro ao criar campanha", variant: "destructive" }),
  });

  const selectedChannel = CHANNELS.find((c) => c.value === channel)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-all" onClick={onClose} />
      
      <div className="relative bg-background border rounded-[2rem] shadow-2xl w-full max-w-6xl overflow-hidden max-h-[90vh] flex">
        
        {/* Step 1: Vertical Stepper Sidebar */}
        <div className="hidden md:flex flex-col w-64 bg-muted/20 border-r shrink-0 p-6">
          <div className="flex items-center gap-2 mb-10 px-2">
            <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
              <Megaphone className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm tracking-tight">Nova Campanha</span>
          </div>

          <div className="flex-1 space-y-1">
            {STEPS.map((label, idx) => {
              const active = idx === step;
              const completed = idx < step;
              return (
                <button
                  key={label}
                  onClick={() => goToStep(idx)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all group",
                    active ? "bg-background shadow-sm ring-1 ring-border" : "hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
                    active ? "bg-primary text-primary-foreground" : 
                    completed ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"
                  )}>
                    {completed ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-bold leading-none", active ? "text-foreground" : "text-muted-foreground")}>
                      {label}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1 truncate opacity-60">
                      {idx === 0 ? "Conteúdo e canal" : idx === 1 ? "Público alvo" : "Data e hora"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-auto pt-6 border-t border-border/50">
            <div className="bg-primary/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Dica IA</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Campanhas personalizadas com o nome do cliente têm 24% mais cliques.
              </p>
            </div>
          </div>
        </div>

        {/* Middle Column: The Form */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative">
          <div className="flex items-center justify-between px-8 py-6 border-b sm:border-none">
            <div>
              <h2 className="text-xl font-bold tracking-tight">{STEPS[step]}</h2>
              <p className="text-xs text-muted-foreground mt-1">Configure os detalhes da sua campanha abaixo</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors md:absolute md:top-6 md:right-6">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-8 space-y-6 overflow-y-auto flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* ─── Step 0: Mensagem ─── */}
              {step === 0 && (
                <>
                  {/* Seletor de canal */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Canal de envio</Label>
                    <div className="grid grid-cols-3 gap-3">
                      {CHANNELS.map((ch) => {
                        const Icon = ch.icon;
                        const active = channel === ch.value;
                        return (
                          <button
                            key={ch.value}
                            type="button"
                            onClick={() => setValue("channel", ch.value)}
                            className={cn(
                              "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all group",
                              active ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border hover:border-muted-foreground/30"
                            )}
                          >
                            <div className={cn("p-2 rounded-xl transition-colors", active ? "bg-primary text-primary-foreground" : "bg-muted group-hover:bg-muted/80")}>
                              <Icon className="w-5 h-5" />
                            </div>
                            <span className={cn("text-xs font-bold", active ? "text-primary" : "text-muted-foreground")}>
                              {ch.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nome e Assunto */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome Interno</Label>
                      <Input id="name" placeholder="ex: Promoção de Páscoa" {...register("name")} className="rounded-xl h-11" />
                      {errors.name && <p className="text-[10px] text-destructive font-medium">{errors.name.message}</p>}
                    </div>
                    {channel === "email" && (
                      <div className="space-y-2">
                        <Label htmlFor="subject" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Assunto do E-mail</Label>
                        <Input id="subject" placeholder="Assunto chamativo..." {...register("subject")} className="rounded-xl h-11" />
                        {errors.subject && <p className="text-[10px] text-destructive font-medium">{errors.subject.message}</p>}
                      </div>
                    )}
                  </div>

                  {/* Editor de Mensagem */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="message" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Conteúdo da Mensagem</Label>
                      <div className="flex items-center gap-2">
                        <CharacterCounter current={message.length} limit={msgLimit} />
                        <span className={cn("text-[10px] font-bold", message.length > msgWarning ? "text-orange-500" : "text-muted-foreground")}>
                          {message.length} / {msgLimit}
                        </span>
                      </div>
                    </div>
                    
                    <div className="relative group">
                      <div className="absolute -top-10 right-0 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAI((v) => !v)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold hover:bg-primary/20 transition-all border border-primary/20"
                        >
                          <Sparkles className="w-3 h-3" />
                          GERAR COM IA
                        </button>
                      </div>

                      <Textarea
                        id="message"
                        rows={channel === "sms" ? 3 : 6}
                        className="rounded-2xl border-2 focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-all resize-none p-4 leading-relaxed"
                        placeholder={
                          channel === "whatsapp" ? "Olá {{nome}}! Temos uma oferta especial para você..." :
                          channel === "sms"      ? "Mensagem curta e objetiva..." : "Corpo do e-mail..."
                        }
                        {...register("message")}
                      />
                      {errors.message && <p className="text-[10px] text-destructive font-medium mt-1">{errors.message.message}</p>}
                    </div>

                    {showAI && (
                      <div className="border-2 border-primary/20 bg-primary/5 rounded-2xl p-4 space-y-4 animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Assistente de Cópia
                          </h4>
                          <button type="button" onClick={() => setShowAI(false)} className="text-primary/60 hover:text-primary"><X className="w-3.5 h-3.5" /></button>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">Objetivo</Label>
                            <Input placeholder="ex: 20% OFF em sapatos" {...register("ai_context")} className="text-xs rounded-lg h-9 bg-background" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[9px] font-bold uppercase text-muted-foreground">Tom</Label>
                            <div className="flex gap-1">
                              {AI_TONES.map((t) => (
                                <button key={t.value} type="button" onClick={() => setValue("ai_tone", t.value)}
                                  className={cn("px-2 py-1 rounded-md text-[9px] font-bold border transition-all",
                                    watch("ai_tone") === t.value ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105" : "bg-background hover:border-primary/30"
                                  )}>
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        <Button type="button" size="sm" className="w-full gap-2 rounded-xl font-bold text-xs h-10 shadow-lg shadow-primary/20" onClick={generateAiCopy} disabled={aiLoading}>
                          {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {aiLoading ? "CRIANDO MAGIA..." : "GERAR VARIAÇÕES INTELIGENTES"}
                        </Button>

                        {aiVariations.length > 0 && (
                          <div className="grid grid-cols-1 gap-2 pt-2">
                            {aiVariations.map(({ label, text }) => (
                              <button key={label} type="button"
                                onClick={() => { setValue(aiTarget === "b" ? "message_b" : "message", text); setShowAI(false); setAiVariations([]); }}
                                className="text-left border-2 border-transparent bg-background rounded-xl p-3 hover:border-primary/40 hover:shadow-md transition-all group relative overflow-hidden"
                              >
                                <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity"><Plus className="w-3 h-3 text-primary" /></div>
                                <p className="text-[9px] font-black text-primary uppercase mb-1">{label}</p>
                                <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed italic">"{text}"</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* A/B Test toggle */}
                  <div className="pt-2">
                    <button type="button" onClick={() => setValue("ab_enabled", !abEnabled)}
                      className={cn("flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all w-full group",
                        abEnabled ? "border-purple-500 bg-purple-500/5 ring-4 ring-purple-500/10" : "border-dashed hover:border-muted-foreground/30"
                      )}
                    >
                      <div className={cn("p-2 rounded-xl transition-colors", abEnabled ? "bg-purple-500 text-white" : "bg-muted text-muted-foreground group-hover:bg-muted/80")}>
                        <FlaskConical className="w-4 h-4" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className={cn("text-xs font-bold", abEnabled ? "text-purple-600" : "text-foreground")}>Teste A/B Inteligente</p>
                        <p className="text-[10px] text-muted-foreground">Descubra qual mensagem performa melhor</p>
                      </div>
                      <div className={cn("w-10 h-5 rounded-full transition-all relative", abEnabled ? "bg-purple-500" : "bg-muted")}>
                        <div className={cn("w-3.5 h-3.5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm", abEnabled ? "right-1" : "left-1")} />
                      </div>
                    </button>

                    {abEnabled && (
                      <div className="mt-4 space-y-4 border-2 border-purple-500/20 rounded-2xl p-5 bg-purple-500/5 animate-in slide-in-from-top-2 duration-300">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="message_b" className="text-xs font-bold text-purple-700">VARIANTE B</Label>
                            <CharacterCounter current={messageB.length} limit={msgLimit} />
                          </div>
                          <Textarea id="message_b" rows={3} className="rounded-xl border-purple-200 focus-visible:ring-purple-500/20 transition-all text-xs" placeholder="Escreva a versão alternativa..." {...register("message_b")} />
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-[10px] font-bold text-purple-700 uppercase">
                            <div className="flex items-center gap-1.5"><Sliders className="w-3 h-3" /> Distribuição de tráfego</div>
                            <span>{abSplit}% A / {100 - abSplit}% B</span>
                          </div>
                          <input type="range" min={10} max={90} step={5} value={abSplit}
                            onChange={(e) => setValue("ab_split", Number(e.target.value))}
                            className="w-full accent-purple-500 h-1.5 bg-purple-200 rounded-lg appearance-none cursor-pointer" />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ─── Step 1: Segmentação ─── */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Público Alvo</Label>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                      {countsLoading ? "Calculando..." : `${Object.values(segmentCounts).reduce((a, b) => (a || 0) + (b || 0), 0)?.toLocaleString()} total`}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    {SEGMENTS.map(({ value, label, description }) => {
                      const count = segmentCounts[value];
                      const selected = watch("segment") === value;
                      const Icon = value === 'vip' ? Trophy : value === 'active' ? Zap : value === 'inactive' ? Clock : value === 'cart_abandoned' ? AlertCircle : Users;
                      
                      return (
                        <label key={value}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all relative overflow-hidden group",
                            selected ? "border-primary bg-primary/5 ring-4 ring-primary/10 shadow-lg" : "hover:border-muted-foreground/20 hover:bg-muted/30"
                          )}
                        >
                          <input type="radio" value={value} {...register("segment")} className="sr-only" />
                          <div className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center transition-all",
                            selected ? "bg-primary text-primary-foreground scale-110 shadow-md" : "bg-muted text-muted-foreground group-hover:bg-background"
                          )}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-sm font-black tracking-tight", selected ? "text-primary" : "text-foreground")}>{label}</p>
                            <p className="text-[11px] text-muted-foreground line-clamp-1">{description}</p>
                          </div>
                          <div className="text-right">
                            <p className={cn("text-sm font-black", selected ? "text-primary" : "text-foreground")}>
                              {countsLoading ? "..." : (count?.toLocaleString("pt-BR") ?? "0")}
                            </p>
                            <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-60">contatos</p>
                          </div>
                          {selected && <div className="absolute top-0 right-0 p-1.5"><Check className="w-3.5 h-3.5 text-primary" /></div>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ─── Step 2: Agendamento ─── */}
              {step === 2 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Quando enviar?</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={cn(
                        "flex items-center justify-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                        sendNow ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "hover:bg-muted/30"
                      )}>
                        <input type="radio" checked={sendNow} onChange={() => setValue("send_now", true)} className="sr-only" />
                        <ZapIcon className={cn("w-4 h-4", sendNow ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-sm font-bold", sendNow ? "text-primary" : "text-muted-foreground")}>Agora</span>
                      </label>
                      <label className={cn(
                        "flex items-center justify-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all",
                        !sendNow ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "hover:bg-muted/30"
                      )}>
                        <input type="radio" checked={!sendNow} onChange={() => setValue("send_now", false)} className="sr-only" />
                        <CalendarDays className={cn("w-4 h-4", !sendNow ? "text-primary" : "text-muted-foreground")} />
                        <span className={cn("text-sm font-bold", !sendNow ? "text-primary" : "text-muted-foreground")}>Agendar</span>
                      </label>
                    </div>
                  </div>

                  {!sendNow && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                      <Label htmlFor="scheduled_at" className="text-[10px] font-bold uppercase text-muted-foreground">Data e Hora do Disparo</Label>
                      <Input id="scheduled_at" type="datetime-local" {...register("scheduled_at")} className="rounded-xl h-12 h-11 border-2 focus:border-primary/40" />
                      {errors.scheduled_at && <p className="text-[10px] text-destructive font-medium">{errors.scheduled_at.message}</p>}
                    </div>
                  )}

                  <div className="bg-muted/30 rounded-[2rem] p-6 border-2 border-dashed border-muted-foreground/20 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground text-center">Resumo da Campanha</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">Canal</p>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const ch = CHANNELS.find((c) => c.value === channel)!;
                            const Icon = ch.icon;
                            return <><Icon className={cn("w-4 h-4", ch.color)} /><span className="text-xs font-bold">{ch.label}</span></>;
                          })()}
                        </div>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">Envio</p>
                        <p className="text-xs font-bold">{sendNow ? "Imediato" : "Agendado"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">Público</p>
                        <p className="text-xs font-bold truncate">{SEGMENTS.find((s) => s.value === watch("segment"))?.label}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">Impacto</p>
                        <p className="text-xs font-bold text-primary">{segmentCounts[watch("segment")]?.toLocaleString("pt-BR") || "0"} pessoas</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between px-8 py-6 border-t bg-muted/10 shrink-0 gap-4">
              <Button type="button" variant="ghost" className="rounded-xl font-bold text-xs h-11 px-6 hover:bg-muted" onClick={step === 0 ? onClose : prevStep}>
                {step === 0 ? "CANCELAR" : (<><ChevronLeft className="w-4 h-4 mr-2" />VOLTAR</>)}
              </Button>
              
              <div className="flex items-center gap-3">
                {step < STEPS.length - 1 ? (
                  <Button type="button" className="rounded-xl font-bold text-xs h-11 px-8 shadow-lg shadow-primary/20 group" onClick={nextStep}>
                    PRÓXIMO <ChevronRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                  </Button>
                ) : (
                  <Button type="submit" className="rounded-xl font-black text-xs h-11 px-10 shadow-lg shadow-primary/30 animate-pulse-slow" disabled={createMutation.isPending}>
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                    {abEnabled ? "LANÇAR TESTE A/B" : "LANÇAR CAMPANHA"}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Live Preview */}
        <iPhoneMockup channel={channel} message={message} subject={watch("subject")} />
      </div>
    </div>
  );
}
