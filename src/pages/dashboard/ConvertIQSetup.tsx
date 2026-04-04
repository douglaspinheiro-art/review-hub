import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, ChevronRight, Loader2, CheckCircle2, XCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSaveLoja, testarGA4, MOCK_METRICAS } from "@/hooks/useConvertIQ";
import { useSaveMetricas } from "@/hooks/useConvertIQ";
import { toast } from "sonner";

const PLATAFORMAS = ["Shopify", "VTEX", "WooCommerce", "Nuvemshop", "Tray", "Outro"];

const steps = ["Setup", "Dados", "Diagnóstico"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={cn(
            "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors",
            i < current  ? "bg-primary text-primary-foreground" :
            i === current ? "bg-primary text-primary-foreground ring-4 ring-primary/20" :
            "bg-muted text-muted-foreground"
          )}>
            {i < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
          </div>
          <span className={cn("text-sm font-medium", i === current ? "text-foreground" : "text-muted-foreground")}>
            {label}
          </span>
          {i < steps.length - 1 && <div className="w-8 h-px bg-border mx-1" />}
        </div>
      ))}
    </div>
  );
}

interface GA4ModalProps {
  onClose: () => void;
  onSave: (pid: string, token: string) => void;
}

function GA4Modal({ onClose, onSave }: GA4ModalProps) {
  const [pid, setPid] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");
  const [visitantesFound, setVisitantesFound] = useState(0);

  async function handleTest() {
    if (!pid || !token) { toast.error("Preencha Property ID e Access Token"); return; }
    setStatus("testing");
    setErrMsg("");
    try {
      const m = await testarGA4(pid, token);
      setVisitantesFound(m.visitantes);
      setStatus("ok");
    } catch (e) {
      setErrMsg((e as Error).message);
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card border rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-lg font-bold mb-1">Conectar Google Analytics 4</h2>
        <p className="text-sm text-muted-foreground mb-5">Configure sua integração GA4 para dados reais</p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="ga4-pid">Property ID</Label>
            <Input id="ga4-pid" placeholder="123456789" value={pid} onChange={e => setPid(e.target.value)} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">GA4 → Admin → Configurações da propriedade → ID da Propriedade</p>
          </div>
          <div>
            <Label htmlFor="ga4-token">Access Token (OAuth)</Label>
            <Input id="ga4-token" placeholder="ya29.xxxxx..." value={token} onChange={e => setToken(e.target.value)} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-1">Google Cloud Console → APIs → Credenciais → OAuth 2.0</p>
          </div>
        </div>

        {status === "ok" && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-500">Conexão estabelecida! {visitantesFound.toLocaleString("pt-BR")} visitantes encontrados nos últimos 30 dias.</p>
          </div>
        )}
        {status === "error" && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-500">{errMsg || "Erro ao conectar. Verifique seu Access Token."}</p>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" className="flex-1" onClick={handleTest} disabled={status === "testing"}>
            {status === "testing" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Testando...</> : "Testar conexão"}
          </Button>
          <Button className="flex-1" disabled={status !== "ok"} onClick={() => onSave(pid, token)}>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ConvertIQSetup() {
  const navigate = useNavigate();
  const saveLoja = useSaveLoja();
  const saveMetricas = useSaveMetricas();

  const [nome, setNome] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState("2.5");
  const [ticket, setTicket] = useState("250");
  const [ga4Pid, setGa4Pid] = useState("");
  const [ga4Token, setGa4Token] = useState("");
  const [showGA4Modal, setShowGA4Modal] = useState(false);

  async function handleSubmit() {
    if (!nome || !plataforma) { toast.error("Nome da loja e plataforma são obrigatórios"); return; }
    try {
      const loja = await saveLoja.mutateAsync({
        nome,
        plataforma,
        url: url || undefined,
        ticket_medio: Number(ticket) || 250,
        meta_conversao: Number(meta) || 2.5,
        ga4_property_id: ga4Pid || undefined,
        ga4_access_token: ga4Token || undefined,
      });

      // Save mock metrics so the dashboard is not empty
      await saveMetricas.mutateAsync({ lojaId: loja.id, metricas: MOCK_METRICAS });

      toast.success("Configuração salva com sucesso!");
      navigate("/dashboard/convertiq");
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  }

  const loading = saveLoja.isPending || saveMetricas.isPending;

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)] px-4">
      {showGA4Modal && (
        <GA4Modal
          onClose={() => setShowGA4Modal(false)}
          onSave={(pid, token) => { setGa4Pid(pid); setGa4Token(token); setShowGA4Modal(false); toast.success("GA4 configurado!"); }}
        />
      )}

      <div className="w-full max-w-[520px]">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <TrendingUp className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Configure o ConvertIQ</h1>
          <p className="text-sm text-muted-foreground mt-1">Conecte suas fontes de dados para diagnóstico automático</p>
        </div>

        <StepIndicator current={0} />

        <div className="bg-card border rounded-2xl p-6 space-y-5">
          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome da loja</Label>
              <Input id="nome" placeholder="Ex: Minha Loja Oficial" value={nome} onChange={e => setNome(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="plataforma">Plataforma</Label>
              <Select value={plataforma} onValueChange={setPlataforma}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a plataforma" />
                </SelectTrigger>
                <SelectContent>
                  {PLATAFORMAS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="url">URL da loja</Label>
              <Input id="url" placeholder="https://minhaloja.com.br" value={url} onChange={e => setUrl(e.target.value)} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="meta">Meta de conversão (%)</Label>
                <div className="relative mt-1">
                  <Input id="meta" type="number" step="0.1" placeholder="2.5" value={meta} onChange={e => setMeta(e.target.value)} className="pr-7" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <Info className="w-3 h-3 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground">Benchmark BR: 2% a 3.5%</p>
                </div>
              </div>
              <div>
                <Label htmlFor="ticket">Ticket médio (R$)</Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                  <Input id="ticket" type="number" placeholder="250" value={ticket} onChange={e => setTicket(e.target.value)} className="pl-9" />
                </div>
              </div>
            </div>
          </div>

          {/* Data sources */}
          <div>
            <p className="text-sm font-semibold mb-1">Conectar fontes de dados</p>
            <p className="text-xs text-muted-foreground mb-3">Opcional — você pode usar dados manuais</p>

            <div className="space-y-2">
              {/* GA4 card */}
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center text-sm font-bold text-orange-500">G4</div>
                  <div>
                    <p className="text-sm font-medium">Google Analytics 4</p>
                    <p className="text-xs text-muted-foreground">Importar métricas reais do funil</p>
                  </div>
                </div>
                {ga4Pid ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">Conectado</span>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setShowGA4Modal(true)}>Conectar GA4</Button>
                )}
              </div>

              {/* Meta Pixel — coming soon */}
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/20 opacity-50 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-sm font-bold text-blue-500">M</div>
                  <div>
                    <p className="text-sm font-medium">Meta Pixel</p>
                    <p className="text-xs text-muted-foreground">Dados do Meta Business</p>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">Em breve</span>
              </div>
            </div>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">ou</span></div>
            </div>

            <p className="text-xs text-center text-muted-foreground mb-2">Usar dados demonstrativos por enquanto e inserir manualmente depois</p>
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Salvando...</> : <>Salvar e continuar <ChevronRight className="w-4 h-4" /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}
