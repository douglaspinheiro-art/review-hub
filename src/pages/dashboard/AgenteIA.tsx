import { useState, useEffect } from "react";
import {
  Zap, MessageCircle, Settings2, Sparkles,
  Save, Bot, ShieldCheck, UserCheck, Headset,
  Target, MessageSquare, Heart, CreditCard,
  TrendingUp, AlertCircle, HelpCircle, Info,
  GitBranch, List, Plus, Trash2, ChevronRight,
  Eye, Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger 
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const PERSONALIDADES = [
  {
    id: "consultivo",
    nome: "Vendedor Consultivo",
    icon: Target,
    desc: "Focado em entender o cliente e converter vendas com argumentos baseados em benefícios.",
    prompt: "Você é um Vendedor Consultivo experiente. Seu tom é persuasivo porém respeitoso. Foque em entender as dores do cliente, oferecer a solução ideal e conduzir para o fechamento. Use gatilhos de prova social e escassez de forma ética."
  },
  {
    id: "suporte",
    nome: "Suporte Técnico",
    icon: Headset,
    desc: "Direto ao ponto, prestativo e focado em resolver problemas de rastreio, trocas e dúvidas.",
    prompt: "Você é um Agente de Suporte de elite. Seu foco é eficiência e resolução. Seja extremamente claro nas instruções, use listas se necessário e sempre confirme se a dúvida foi sanada. Tom paciente e técnico-amigável."
  },
  {
    id: "amigavel",
    nome: "Amigável & Casual",
    icon: Heart,
    desc: "Usa gírias leves, muitos emojis e cria uma conexão emocional próxima com o cliente.",
    prompt: "Você é um Agente Super Amigável! Use uma linguagem jovem, emojis e trate o cliente como um amigo próximo. Crie conexão emocional, use termos como 'obrigada pelo carinho' e foque em encantar a cada mensagem."
  },
  {
    id: "formal",
    nome: "Executivo Formal",
    icon: UserCheck,
    desc: "Linguagem polida, sem emojis, transmitindo autoridade e seriedade máxima.",
    prompt: "Você é um Agente Executivo. Use a norma culta, evite emojis e gírias. Transmita extrema seriedade, autoridade e profissionalismo. Respostas polidas e objetivas."
  }
];

export default function AgenteIA() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lojas, setLojas] = useState<any[]>([]);
  const [selectedLoja, setSelectedLoja] = useState<string>("");
  
  // IA States
  const [config, setConfig] = useState<any>({
    ativo: false,
    modo: 'sugestao',
    personalidade_preset: 'consultivo',
    prompt_sistema: '',
    conhecimento_loja: '',
    tom_de_voz: 'amigável e profissional'
  });

  // Negociação States
  const [iaNegotiation, setIaNegotiation] = useState(true);
  const [iaMaxDiscount, setIaMaxDiscount] = useState([10]);
  const [socialProof, setSocialProof] = useState(true);
  const [pixKey, setPixKey] = useState("");

  // Fluxos Estruturados (Mock de exemplo)
  const [structuredFlows, setStructuredFlows] = useState<any[]>([
    { id: 1, trigger: "/rastreio", steps: 3, active: true },
    { id: 2, trigger: "Oi / Olá", steps: 1, active: true },
    { id: 3, trigger: "Menu Principal", steps: 5, active: false }
  ]);

  useEffect(() => {
    if (user) {
      fetchLojas();
    }
  }, [user]);

  useEffect(() => {
    if (selectedLoja) {
      fetchConfig();
    }
  }, [selectedLoja]);

  async function fetchLojas() {
    const { data } = await supabase.from("stores").select("id, name");
    if (data && data.length > 0) {
      setLojas(data);
      setSelectedLoja(data[0].id);
    }
  }

  async function fetchConfig() {
    setLoading(true);
    const { data: aiData } = await supabase
      .from("ai_agent_config" as any)
      .select("*")
      .eq("store_id" as any, selectedLoja)
      .maybeSingle();

    if (aiData) setConfig(aiData);

    if (profile) {
      setIaNegotiation(profile.ia_negotiation_enabled ?? true);
      setIaMaxDiscount([profile.ia_max_discount_pct ?? 10]);
      setSocialProof(profile.social_proof_enabled ?? true);
      setPixKey(profile.pix_key ?? "");
    }
    setIsDirty(false);
    setLoading(false);
  }

  const applyPreset = (preset: any) => {
    setConfig({
      ...config,
      personalidade_preset: preset.id,
      prompt_sistema: preset.prompt
    });
    setIsDirty(true);
    toast.info(`Personalidade '${preset.name}' aplicada!`);
  };

  async function handleSave() {
    setSaving(true);
    try {
      await supabase.from("ai_agent_config" as any).upsert({
        ...config,
        user_id: user!.id,
        store_id: selectedLoja,
        updated_at: new Date().toISOString()
      }, { onConflict: 'store_id' });

      await supabase.from("profiles").update({
        ia_negotiation_enabled: iaNegotiation,
        ia_max_discount_pct: iaMaxDiscount[0],
        social_proof_enabled: socialProof,
        pix_key: pixKey
      }).eq("id", user!.id);

      setIsDirty(false);
      toast.success("Cérebro unificado atualizado!");
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !selectedLoja) return <div className="p-10 text-center animate-pulse font-bold font-syne uppercase tracking-widest italic">Sincronizando Inteligência Multicamada...</div>;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase flex items-center gap-3 italic">
            <Bot className="w-8 h-8 text-primary" /> Agente IA
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-sm font-medium">Cérebro da loja:</p>
            <Select value={selectedLoja} onValueChange={setSelectedLoja}>
              <SelectTrigger className="h-8 w-fit bg-muted border-none font-bold text-xs rounded-lg px-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lojas.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-card border border-border/50 p-2 px-4 rounded-2xl shadow-sm">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status Geral</span>
            <span className={cn("text-xs font-black", config?.ativo ? "text-emerald-500" : "text-red-500")}>
              {config?.ativo ? "SISTEMA ATIVADO" : "SISTEMA DESATIVADO"}
            </span>
          </div>
          <Switch 
            checked={config?.ativo} 
            onCheckedChange={(val) => setConfig({...config, ativo: val})} 
          />
        </div>
      </div>

      <Tabs defaultValue="vendas" className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-xl mb-8 overflow-x-auto flex-nowrap h-auto justify-start border border-border/20">
          <TabsTrigger value="vendas" className="rounded-lg px-6 font-bold text-xs gap-2">
            <Zap className="w-3.5 h-3.5" /> Negociação & Vendas
          </TabsTrigger>
          <TabsTrigger value="persona" className="rounded-lg px-6 font-bold text-xs gap-2">
            <UserCheck className="w-3.5 h-3.5" /> Persona & Voz
          </TabsTrigger>
          <TabsTrigger value="fluxos" className="rounded-lg px-6 font-bold text-xs gap-2">
            <GitBranch className="w-3.5 h-3.5" /> Fluxos Estruturados
          </TabsTrigger>
          <TabsTrigger value="simulador" className="rounded-lg px-6 font-bold text-xs gap-2 text-orange-500">
            <Play className="w-3.5 h-3.5" /> Simulador
          </TabsTrigger>
        </TabsList>

        {/* --- TAB: NEGOCIAÇÃO & VENDAS --- */}
        <TabsContent value="vendas" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-8 shadow-sm border-none bg-card/50">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" /> IA Negociadora
                </h3>
                <p className="text-xs text-muted-foreground">O Claude 3.5 responde objeções de preço e frete automaticamente.</p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-border/40">
                  <Label className="text-sm font-bold cursor-pointer" htmlFor="neg-active">Ativar Negociação Automática</Label>
                  <Switch id="neg-active" checked={iaNegotiation} onCheckedChange={(v) => { setIaNegotiation(v); setIsDirty(true); }} />
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <Label className="text-xs font-bold uppercase text-muted-foreground tracking-widest">Margem de Desconto IA</Label>
                    <span className="text-xl font-black text-amber-500">{iaMaxDiscount[0]}%</span>
                  </div>
                  <Slider value={iaMaxDiscount} onValueChange={(v) => { setIaMaxDiscount(v); setIsDirty(true); }} max={30} min={5} step={5} className="py-2" />
                  <div className="flex items-start gap-2 bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                    <Info className="w-3 h-3 text-amber-600 mt-0.5" />
                    <p className="text-[10px] text-amber-700 font-medium leading-relaxed italic">
                      A IA tentará fechar a venda usando o <span className="font-bold">mínimo possível</span> dessa margem.
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-8 shadow-sm border-none bg-card/50">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-500" /> Prova Social Dinâmica
                </h3>
                <p className="text-xs text-muted-foreground">Injeta gatilhos de urgência baseada nas vendas recentes da sua loja.</p>
              </div>

              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-background/50 rounded-xl border border-border/40">
                  <Label className="text-sm font-bold cursor-pointer" htmlFor="social-active">Injetar Prova Social nas Conversas</Label>
                  <Switch id="social-active" checked={socialProof} onCheckedChange={(v) => { setSocialProof(v); setIsDirty(true); }} />
                </div>
                <div className="bg-[#0A0A0F] rounded-xl p-4 border border-white/5 space-y-3">
                  <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/60 flex items-center gap-1">
                    <Sparkles className="w-2 h-2" /> Exemplo de aplicação
                  </span>
                  <p className="text-[11px] text-white/80 leading-relaxed italic">
                    "Hoje, <span className="text-emerald-400 font-bold">14 pessoas</span> já compraram este item. Garanta o seu!"
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6 space-y-8 shadow-sm border-none bg-card/50 md:col-span-2 lg:col-span-1">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-500" /> PIX Copia e Cola
                </h3>
                <p className="text-xs text-muted-foreground">Gera o código de pagamento instantaneamente no WhatsApp.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Sua Chave PIX</Label>
                  <Input 
                    value={pixKey}
                    onChange={e => { setPixKey(e.target.value); setIsDirty(true); }}
                    placeholder="CNPJ, E-mail ou Celular" 
                    className={cn("h-11 rounded-xl bg-background/50 font-mono text-sm", iaNegotiation && !pixKey && "border-amber-500")} 
                  />
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* --- TAB: PERSONA & VOZ --- */}
        <TabsContent value="persona" className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <section className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Voz da Marca</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PERSONALIDADES.map((p) => (
                    <div 
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className={cn(
                        "p-5 rounded-2xl border-2 transition-all cursor-pointer relative overflow-hidden group",
                        config.personalidade_preset === p.id ? "border-primary bg-primary/5 shadow-lg shadow-primary/5" : "border-border/50 bg-card hover:border-primary/20"
                      )}
                    >
                      <div className="flex gap-4 relative z-10">
                        <div className={cn(
                          "w-12 h-12 rounded-xl flex items-center justify-center transition-colors",
                          config.personalidade_preset === p.id ? "bg-primary text-white" : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        )}>
                          <p.icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1 text-left">
                          <h4 className="font-bold text-sm">{p.name}</h4>
                          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{p.desc}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <Card className="p-6 space-y-6 shadow-sm border-none bg-card/50">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground italic">Prompt de Sistema (Claude Core)</Label>
                  <Textarea 
                    value={config.prompt_sistema} 
                    onChange={(e) => setConfig({...config, prompt_sistema: e.target.value})}
                    className="min-h-[120px] bg-background/50 font-mono text-[11px] leading-relaxed rounded-xl border-none" 
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Base de Conhecimento (FAQ, Prazos, Frete)</Label>
                  <Textarea 
                    value={config.conhecimento_loja} 
                    onChange={(e) => setConfig({...config, conhecimento_loja: e.target.value})}
                    className="min-h-[100px] bg-background/50 text-[11px] leading-relaxed rounded-xl border-none" 
                    placeholder="Descreva as políticas da loja aqui..."
                  />
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 bg-primary/5 border-primary/20 rounded-2xl relative overflow-hidden group border-none">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <ShieldCheck className="w-16 h-16 text-primary" />
                </div>
                <h4 className="font-bold text-xs mb-4 uppercase tracking-widest text-primary italic">Status Neural</h4>
                <ul className="space-y-4">
                  {[
                    { label: "Claude 3.5 Sonnet", status: "Conectado", icon: Zap },
                    { label: "Filtro de Conteúdo", status: "Ativo", icon: ShieldCheck },
                    { label: "Latência Média", status: "840ms", icon: Heart }
                  ].map((item, i) => (
                    <li key={i} className="flex items-center justify-between border-b border-border/10 pb-3 last:border-0">
                      <div className="flex items-center gap-2 text-left">
                        <item.icon className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.label}</span>
                      </div>
                      <Badge className="bg-primary/10 text-primary border-0 text-[8px] font-black">{item.status}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* --- TAB: FLUXOS ESTRUTURADOS --- */}
        <TabsContent value="fluxos" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground italic flex items-center gap-2">
                  <GitBranch className="w-4 h-4" /> Automações Definidas
                </h3>
                <Button size="sm" className="h-8 text-[10px] font-black uppercase tracking-widest gap-2 rounded-lg">
                  <Plus className="w-3.5 h-3.5" /> Novo Fluxo
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {structuredFlows.map(flow => (
                  <div key={flow.id} className="bg-card border border-border/50 rounded-2xl p-5 flex items-center justify-between group hover:border-primary/30 transition-all shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                        flow.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground opacity-50"
                      )}>
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm tracking-tight italic">Gatilho: <span className="text-primary underline decoration-primary/30">{flow.trigger}</span></h4>
                          {!flow.active && <Badge variant="outline" className="text-[8px] font-black opacity-50">INATIVO</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-1 italic">Estrutura: {flow.steps} passos sequenciais</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"><Settings2 className="w-4 h-4 text-muted-foreground" /></Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity text-red-500"><Trash2 className="w-4 h-4" /></Button>
                      <div className="h-8 w-px bg-border/50 mx-2" />
                      <Switch checked={flow.active} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <Card className="p-6 border-dashed border-2 bg-muted/20 space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-2">
                  <AlertCircle className="w-6 h-6 text-muted-foreground" />
                </div>
                <h4 className="font-bold text-sm italic tracking-tight">Quando usar Fluxos?</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use fluxos estruturados para <span className="text-foreground font-bold">processos rígidos</span> onde a IA não deve improvisar, como:
                </p>
                <ul className="space-y-2">
                  {[
                    "Consultas de Rastreio",
                    "Menus de Opções (1, 2, 3...)",
                    "Coleta de Dados Sensíveis",
                    "Redirecionamento Setorial"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                      <ChevronRight className="w-3 h-3 text-primary" /> {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* --- TAB: SIMULADOR --- */}
        <TabsContent value="simulador" className="space-y-6 max-w-2xl mx-auto">
          <Card className="p-6 space-y-4 rounded-3xl border-none bg-[#0A0A0F] shadow-2xl overflow-hidden relative">
             <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-bold text-white tracking-tight uppercase italic">Playground Claude 3.5</p>
                  <p className="text-[9px] text-emerald-500 flex items-center gap-1 font-black tracking-[0.2em]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> SIMULAÇÃO ATIVA
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-[8px] border-white/10 text-white/50 px-2 py-1 uppercase font-black tracking-widest">Sandbox Mode</Badge>
            </div>

            <div className="h-[350px] overflow-y-auto space-y-6 py-4 scrollbar-hide text-left">
              <div className="bg-muted/20 rounded-2xl p-4 text-[11px] max-w-[85%] border border-border/50 text-white/70 italic leading-relaxed">
                "Olá! Gostei da jaqueta, mas achei o preço um pouco alto para mim agora. Tem algum desconto?"
              </div>
              <div className="bg-primary/10 rounded-2xl p-4 text-[11px] max-w-[85%] ml-auto text-right font-medium text-primary border border-primary/20 animate-in fade-in slide-in-from-right-2 leading-relaxed">
                {iaNegotiation ? 
                  `Entendo perfeitamente! 🏷️ Para não perder essa oportunidade, consegui liberar um cupom exclusivo de ${iaMaxDiscount[0]}% OFF agora: CUPOM${iaMaxDiscount[0]}. Posso gerar o link de pagamento PIX para você? 😊` :
                  `Olá! Nossos preços refletem a alta qualidade do material e exclusividade da peça. Posso te ajudar com outra dúvida?`
                }
              </div>
            </div>

            <div className="p-2 bg-white/5 rounded-2xl border border-white/5 flex gap-2">
              <Input placeholder="Tente uma objeção ou dúvida..." className="bg-transparent border-none text-white text-xs h-10 italic" />
              <Button size="icon" className="rounded-xl h-10 w-10 shrink-0 bg-primary/20 hover:bg-primary transition-all text-primary hover:text-white"><MessageSquare className="w-4 h-4" /></Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className={cn(
        "fixed bottom-0 left-0 right-0 p-4 bg-background/95 backdrop-blur-lg border-t border-border z-50 flex items-center justify-between gap-3 transition-all duration-300",
        isDirty ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"
      )}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs font-bold text-amber-600">Mudanças não salvas</span>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="h-11 px-8 rounded-xl font-black text-xs uppercase tracking-widest gap-2 bg-primary text-primary-foreground shadow-lg shadow-primary/30"
        >
          {saving ? <Zap className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Sincronizar Cérebro Unificado
        </Button>
      </div>
    </div>
  );
}
