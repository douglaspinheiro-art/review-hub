import { useState, useEffect } from "react";
import { 
  Zap, MessageCircle, Settings2, Sparkles, 
  Play, Pause, Save, HelpCircle, Bot,
  Info, ShieldCheck, UserCheck, Headset, 
  Target, MessageSquare, Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
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

export default function Chatbot() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lojas, setLojas] = useState<any[]>([]);
  const [selectedLoja, setSelectedLoja] = useState<string>("");
  const [config, setConfig] = useState<any>({
    ativo: false,
    modo: 'sugestao',
    personalidade_preset: 'consultivo',
    prompt_sistema: '',
    conhecimento_loja: '',
    tom_de_voz: 'amigável e profissional'
  });

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
    const { data } = await supabase.from("lojas").select("id, nome");
    if (data && data.length > 0) {
      setLojas(data);
      setSelectedLoja(data[0].id);
    }
  }

  async function fetchConfig() {
    setLoading(true);
    const { data, error } = await supabase
      .from("agente_ia_config")
      .select("*")
      .eq("loja_id", selectedLoja)
      .maybeSingle();

    if (data) {
      setConfig(data);
    } else {
      // Reset config for new store or use defaults
      const defaultPreset = PERSONALIDADES.find(p => p.id === 'consultivo');
      setConfig({
        loja_id: selectedLoja,
        ativo: false,
        modo: 'sugestao',
        personalidade_preset: 'consultivo',
        prompt_sistema: defaultPreset?.prompt || '',
        conhecimento_loja: '',
        tom_de_voz: 'amigável e profissional'
      });
    }
    setLoading(false);
  }

  const applyPreset = (preset: any) => {
    setConfig({
      ...config,
      personalidade_preset: preset.id,
      prompt_sistema: preset.prompt
    });
    toast.info(`Personalidade '${preset.nome}' aplicada!`);
  };

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from("agente_ia_config")
      .upsert({
        ...config,
        user_id: user!.id,
        loja_id: selectedLoja,
        updated_at: new Date().toISOString()
      }, { onConflict: 'loja_id' });

    if (error) {
      console.error(error);
      toast.error("Erro ao salvar configurações");
    } else {
      toast.success("Configurações do Agente atualizadas!");
    }
    setSaving(false);
  }

  if (loading && !selectedLoja) return <div className="p-10 text-center animate-pulse font-bold font-syne">IDENTIFICANDO LOJAS...</div>;

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black font-syne tracking-tighter uppercase flex items-center gap-3">
            <Bot className="w-8 h-8 text-primary" /> Agente de IA
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-sm">Configurando o cérebro da loja:</p>
            <Select value={selectedLoja} onValueChange={setSelectedLoja}>
              <SelectTrigger className="h-8 w-fit bg-muted border-none font-bold text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {lojas.map(l => (
                  <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-card border border-border/50 p-2 px-4 rounded-2xl shadow-sm">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Status Online</span>
            <span className={cn("text-xs font-black", config?.ativo ? "text-emerald-500" : "text-red-500")}>
              {config?.ativo ? "AGENTE ATIVADO" : "IA DESATIVADA"}
            </span>
          </div>
          <Switch 
            checked={config?.ativo} 
            onCheckedChange={(val) => setConfig({...config, ativo: val})} 
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          
          {/* Seleção de Personalidade (Presets) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Personalidade da Loja</h3>
              <Badge variant="outline" className="text-[8px] font-black border-primary/30 text-primary">IA PERSONA V4</Badge>
            </div>
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
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-sm">{p.nome}</h4>
                        {config.personalidade_preset === p.id && <Zap className="w-3 h-3 text-primary fill-primary" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Configurações Avançadas */}
          <Card className="p-6 space-y-8 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" /> Ajuste Fino do Agente
                </h3>
                <p className="text-xs text-muted-foreground">Personalize o cérebro da IA para esta loja específica.</p>
              </div>
              <div className="flex bg-muted p-1 rounded-xl">
                <Button 
                  variant={config.modo === 'sugestao' ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-[10px] font-black uppercase tracking-tighter"
                  onClick={() => setConfig({...config, modo: 'sugestao'})}
                >Sugestão</Button>
                <Button 
                  variant={config.modo === 'piloto_automatico' ? "secondary" : "ghost"}
                  size="sm"
                  className="h-7 text-[10px] font-black uppercase tracking-tighter"
                  onClick={() => setConfig({...config, modo: 'piloto_automatico'})}
                >Piloto Automático</Button>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center justify-between">
                  Prompt de Sistema (Core)
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="w-3 h-3" /></TooltipTrigger>
                      <TooltipContent className="text-[10px] max-w-xs">Define quem a IA finge ser. Alterado automaticamente ao trocar a personalidade.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Textarea 
                  value={config.prompt_sistema} 
                  onChange={(e) => setConfig({...config, prompt_sistema: e.target.value})}
                  className="min-h-[150px] bg-muted/30 font-mono text-[11px] leading-relaxed rounded-xl border-none focus-visible:ring-primary/30" 
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tom de Voz</Label>
                  <Input 
                    value={config.tom_de_voz} 
                    onChange={(e) => setConfig({...config, tom_de_voz: e.target.value})}
                    placeholder="Ex: Amigável, Urbano, Executivo..." 
                    className="h-11 bg-muted/30 border-none rounded-xl font-bold text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-emerald-500">API Gemini (Prioridade)</Label>
                  <Input 
                    placeholder="AIza..." 
                    className="h-11 bg-emerald-500/5 border-emerald-500/20 border text-emerald-500 rounded-xl font-mono text-xs"
                    type="password"
                    value="••••••••••••••••••••"
                    disabled
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Base de Conhecimento da Loja</Label>
                <Textarea 
                  value={config.conhecimento_loja} 
                  onChange={(e) => setConfig({...config, conhecimento_loja: e.target.value})}
                  className="min-h-[100px] bg-muted/30 text-[11px] leading-relaxed rounded-xl border-none focus-visible:ring-primary/30" 
                  placeholder="Políticas de frete, horário de atendimento, FAQ rápido..."
                />
              </div>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="w-full h-12 rounded-xl font-black text-xs uppercase tracking-widest gap-2 bg-primary text-primary-foreground shadow-xl shadow-primary/20 hover:scale-[1.01] transition-transform"
            >
              {saving ? <Zap className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Configuração da Loja
            </Button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-primary/5 border-primary/20 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <ShieldCheck className="w-16 h-16 text-primary" />
            </div>
            <h4 className="font-bold text-xs mb-4 uppercase tracking-widest text-primary italic">Status de Segurança</h4>
            <ul className="space-y-4">
              {[
                { label: "Privacidade de Dados", status: "Ativo", icon: ShieldCheck },
                { label: "Filtro Anti-Spam", status: "Protegido", icon: Zap },
                { label: "Humor do Agente", status: "Estável", icon: Heart }
              ].map((item, i) => (
                <li key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <item.icon className="w-3.5 h-3.5 text-primary" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{item.label}</span>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-0 text-[8px] font-black">{item.status}</Badge>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-6 space-y-4 rounded-2xl border-dashed border-2">
            <h4 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" /> Simulador de Resposta
            </h4>
            <div className="bg-[#0A0A0F] rounded-2xl p-4 space-y-4 shadow-inner">
              <div className="bg-muted/20 rounded-xl p-3 text-[10px] max-w-[85%] border border-border/50">
                "Onde está meu pedido?"
              </div>
              <div className="bg-primary/10 rounded-xl p-3 text-[10px] max-w-[85%] ml-auto text-right font-medium text-primary border border-primary/20 animate-in fade-in slide-in-from-right-2">
                {config.personalidade_preset === 'consultivo' ? 'Vou conferir agora! Me informe o número do seu CPF ou pedido por favor? 😊' : 
                 config.personalidade_preset === 'formal' ? 'Prezado cliente, por gentileza informe o identificador de sua compra para consulta imediata.' :
                 'Opa! Já tô caçando ele aqui! 🕵️‍♂️ Me manda seu CPF ou o código do pedido pra eu te falar onde ele tá agora?'}
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground italic text-center leading-tight">
              O Agente utilizará o tom de voz <strong>{config.personalidade_preset}</strong> configurado acima.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Minimal Tooltip Mock if needed, but assuming shadcn components are available
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
