import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { BetaLimitedPageGuard } from "./components/BetaLimitedPageGuard.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import DashboardLayout from "./components/dashboard/DashboardLayout.tsx";
import { useSistemaConfig } from "@/hooks/useSistemaConfig";
import { useIsAdmin } from "@/hooks/useAdminCheck";
import TelaManutencao from "./components/TelaManutencao";
import { DemoProvider } from "@/contexts/DemoContext.tsx";

// ── QueryClient with stability config ─────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

function MaintenanceWrapper({ children }: { children: React.ReactNode }) {
  const { data: config } = useSistemaConfig();
  const { data: isAdmin } = useIsAdmin();

  const isManutencao = config?.maintenance_active ?? false;

  if (isManutencao && !isAdmin) {
    return <TelaManutencao mensagem={config?.maintenance_message ?? null} />;
  }

  return <>{children}</>;
}

function DashboardRoute({ children, requiredPlan }: { children: React.ReactNode; requiredPlan?: "starter" | "growth" | "scale" | "enterprise" }) {
  return (
    <ProtectedRoute requiredPlan={requiredPlan}>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
  );
}

function DemoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-amber-950 text-xs font-black text-center py-1.5 tracking-widest uppercase flex items-center justify-center gap-3">
      <span>Modo Demonstração — dados fictícios</span>
      <a href="/signup" className="underline hover:no-underline font-black">Criar conta grátis →</a>
    </div>
  );
}

function DemoRoute({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <DemoBanner />
      <div className="pt-7">
        <ProtectedRoute>
          <DashboardLayout>{children}</DashboardLayout>
        </ProtectedRoute>
      </div>
    </DemoProvider>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Lazily loaded public pages
const Index = lazy(() => import("./pages/Index.tsx"));
const Login = lazy(() => import("./pages/Login.tsx"));
const Signup = lazy(() => import("./pages/Signup.tsx"));
const Onboarding = lazy(() => import("./pages/Onboarding.tsx"));
const Analisando = lazy(() => import("./pages/Analisando.tsx"));
const Resultado = lazy(() => import("./pages/Resultado.tsx"));
const Sobre = lazy(() => import("./pages/Sobre.tsx"));
const Blog = lazy(() => import("./pages/Blog.tsx"));
const Carreiras = lazy(() => import("./pages/Carreiras.tsx"));
const Contato = lazy(() => import("./pages/Contato.tsx"));
const CentralDeAjuda = lazy(() => import("./pages/CentralDeAjuda.tsx"));
const Documentacao = lazy(() => import("./pages/Documentacao.tsx"));
const Status = lazy(() => import("./pages/Status.tsx"));
const Privacidade = lazy(() => import("./pages/Privacidade.tsx"));
const Termos = lazy(() => import("./pages/Termos.tsx"));
const LGPD = lazy(() => import("./pages/LGPD.tsx"));
const API = lazy(() => import("./pages/API.tsx"));
const Pontos = lazy(() => import("./pages/portal/Pontos.tsx"));
const AfiliadosPublico = lazy(() => import("./pages/AfiliadosPublico.tsx"));
const RelatorioAnual = lazy(() => import("./pages/RelatorioAnual.tsx"));
const Diagnostico = lazy(() => import("./pages/Diagnostico.tsx"));
const Calculadora = lazy(() => import("./pages/Calculadora.tsx"));
const Benchmark = lazy(() => import("./pages/Benchmark.tsx"));
const PlanosPage = lazy(() => import("./pages/Planos.tsx"));
const Upgrade = lazy(() => import("./pages/Upgrade.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));

// Lazily loaded dashboard pages
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard.tsx"));
const Prescricoes = lazy(() => import("./pages/dashboard/Prescricoes.tsx"));
const Funil = lazy(() => import("./pages/dashboard/Funil.tsx"));
const Produtos = lazy(() => import("./pages/dashboard/Produtos.tsx"));
const Canais = lazy(() => import("./pages/dashboard/Canais.tsx"));
const Forecast = lazy(() => import("./pages/dashboard/Forecast.tsx"));
const EmExecucao = lazy(() => import("./pages/dashboard/EmExecucao.tsx"));
const Inbox = lazy(() => import("./pages/dashboard/Inbox.tsx"));
const Campanhas = lazy(() => import("./pages/dashboard/Campanhas.tsx"));
const Contatos = lazy(() => import("./pages/dashboard/Contatos.tsx"));
const Analytics = lazy(() => import("./pages/dashboard/Analytics.tsx"));
const Configuracoes = lazy(() => import("./pages/dashboard/Configuracoes.tsx"));
const Billing = lazy(() => import("./pages/dashboard/Billing.tsx"));
const WhatsApp = lazy(() => import("./pages/dashboard/WhatsApp.tsx"));
const Automacoes = lazy(() => import("./pages/dashboard/Automacoes.tsx"));
const CarrinhoAbandonado = lazy(() => import("./pages/dashboard/CarrinhoAbandonado.tsx"));
const Reviews = lazy(() => import("./pages/dashboard/Reviews.tsx"));
const RFM = lazy(() => import("./pages/dashboard/RFM.tsx"));
const ApiKeys = lazy(() => import("./pages/dashboard/ApiKeys.tsx"));
const WhiteLabel = lazy(() => import("./pages/dashboard/WhiteLabel.tsx"));
const Integracoes = lazy(() => import("./pages/dashboard/Integracoes.tsx"));
const Equipe = lazy(() => import("./pages/dashboard/Equipe.tsx"));
const Afiliados = lazy(() => import("./pages/dashboard/Afiliados.tsx"));
const Fidelidade = lazy(() => import("./pages/dashboard/Fidelidade.tsx"));
const Relatorios = lazy(() => import("./pages/dashboard/Relatorios.tsx"));
const Chatbot = lazy(() => import("./pages/dashboard/Chatbot.tsx"));
const AgenteIA = lazy(() => import("./pages/dashboard/AgenteIA.tsx"));
const BenchmarkScore = lazy(() => import("./pages/dashboard/BenchmarkScore.tsx"));
const ConvertIQDiagnostico = lazy(() => import("./pages/dashboard/ConvertIQDiagnostico.tsx"));
const ConvertIQPlano = lazy(() => import("./pages/dashboard/ConvertIQPlano.tsx"));
const Newsletter = lazy(() => import("./pages/dashboard/Newsletter.tsx"));
const Atribuicao = lazy(() => import("./pages/dashboard/Atribuicao.tsx"));
const Operacoes = lazy(() => import("./pages/dashboard/Operacoes.tsx"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
        <MaintenanceWrapper>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
          <Route path="/analisando" element={<ProtectedRoute><Analisando /></ProtectedRoute>} />
          <Route path="/resultado" element={<ProtectedRoute><Resultado /></ProtectedRoute>} />
          <Route path="/sobre" element={<Sobre />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/carreiras" element={<Carreiras />} />
          <Route path="/contato" element={<Contato />} />
          <Route path="/central-de-ajuda" element={<CentralDeAjuda />} />
          <Route path="/documentacao" element={<Documentacao />} />
          <Route path="/status" element={<Status />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/termos" element={<Termos />} />
          <Route path="/lgpd" element={<LGPD />} />
          <Route path="/api" element={<API />} />
          <Route path="/planos" element={<DashboardRoute><PlanosPage embedInDashboard /></DashboardRoute>} />
          <Route path="/upgrade" element={<Upgrade />} />
          <Route path="/planos/simulador" element={<DashboardRoute><PlanosPage embedInDashboard defaultTab="simulador" /></DashboardRoute>} />
          <Route path="/diagnostico" element={<DashboardRoute><Diagnostico embedInDashboard /></DashboardRoute>} />
          <Route path="/calculadora-abandono-carrinho" element={<Calculadora />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route path="/afiliados" element={<AfiliadosPublico />} />
          <Route path="/agencias" element={<Navigate to="/afiliados" replace />} />
          <Route path="/relatorio-anual" element={<RelatorioAnual />} />
          <Route path="/pontos/:slug" element={<Pontos />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />

          {/* Demo dashboard */}
          <Route path="/demo" element={<DemoRoute><Dashboard /></DemoRoute>} />
          <Route path="/demo/prescricoes" element={<DemoRoute><Prescricoes /></DemoRoute>} />
          <Route path="/demo/funil" element={<DemoRoute><Funil /></DemoRoute>} />
          <Route path="/demo/produtos" element={<DemoRoute><Produtos /></DemoRoute>} />
          <Route path="/demo/canais" element={<DemoRoute><Canais /></DemoRoute>} />
          <Route path="/demo/inbox" element={<DemoRoute><Inbox /></DemoRoute>} />
          <Route path="/demo/campanhas" element={<DemoRoute><Campanhas /></DemoRoute>} />
          <Route path="/demo/contatos" element={<DemoRoute><Contatos /></DemoRoute>} />
          <Route path="/demo/rfm" element={<DemoRoute><RFM /></DemoRoute>} />
          <Route path="/demo/automacoes" element={<DemoRoute><Automacoes /></DemoRoute>} />
          <Route path="/demo/analytics" element={<DemoRoute><Analytics /></DemoRoute>} />
          <Route path="/demo/relatorios" element={<DemoRoute><Relatorios /></DemoRoute>} />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
          <Route path="/dashboard/prescricoes" element={<DashboardRoute><Prescricoes /></DashboardRoute>} />
          <Route path="/dashboard/funil" element={<DashboardRoute><Funil /></DashboardRoute>} />
          <Route path="/dashboard/funil/diagnostico" element={<DashboardRoute><ConvertIQDiagnostico /></DashboardRoute>} />
          <Route path="/dashboard/funil/plano" element={<DashboardRoute><ConvertIQPlano /></DashboardRoute>} />
          <Route path="/dashboard/produtos" element={<DashboardRoute><Produtos /></DashboardRoute>} />
          <Route path="/dashboard/canais" element={<DashboardRoute><Canais /></DashboardRoute>} />
          <Route path="/dashboard/forecast" element={<DashboardRoute requiredPlan="growth"><Forecast /></DashboardRoute>} />
          <Route path="/dashboard/em-execucao" element={<DashboardRoute><EmExecucao /></DashboardRoute>} />
          <Route path="/dashboard/inbox" element={<DashboardRoute><BetaLimitedPageGuard><Inbox /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/campanhas" element={<DashboardRoute><BetaLimitedPageGuard><Campanhas /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/contatos" element={<DashboardRoute><Contatos /></DashboardRoute>} />
          <Route path="/dashboard/rfm" element={<DashboardRoute><RFM /></DashboardRoute>} />
          <Route path="/dashboard/automacoes" element={<DashboardRoute><BetaLimitedPageGuard><Automacoes /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/carrinho-abandonado" element={<DashboardRoute><BetaLimitedPageGuard><CarrinhoAbandonado /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/carrinhos" element={<Navigate to="/dashboard/carrinho-abandonado" replace />} />
          <Route path="/dashboard/agente-ia" element={<DashboardRoute><AgenteIA /></DashboardRoute>} />
          <Route path="/dashboard/reviews" element={<DashboardRoute><Reviews /></DashboardRoute>} />
          <Route path="/dashboard/analytics" element={<DashboardRoute><Analytics /></DashboardRoute>} />
          <Route path="/dashboard/whatsapp" element={<DashboardRoute><BetaLimitedPageGuard><WhatsApp /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/configuracoes" element={<DashboardRoute><Configuracoes /></DashboardRoute>} />
          <Route path="/dashboard/billing" element={<DashboardRoute><Billing /></DashboardRoute>} />
          <Route path="/dashboard/api-keys" element={<DashboardRoute><ApiKeys /></DashboardRoute>} />
          <Route path="/dashboard/white-label" element={<DashboardRoute><WhiteLabel /></DashboardRoute>} />
          <Route path="/dashboard/integracoes" element={<DashboardRoute><Integracoes /></DashboardRoute>} />
          <Route path="/dashboard/equipe" element={<DashboardRoute><Equipe /></DashboardRoute>} />
          <Route path="/dashboard/afiliados" element={<DashboardRoute><Afiliados /></DashboardRoute>} />
          <Route path="/dashboard/fidelidade" element={<DashboardRoute><Fidelidade /></DashboardRoute>} />
          <Route path="/dashboard/relatorios" element={<DashboardRoute><Relatorios /></DashboardRoute>} />
          <Route path="/dashboard/benchmark" element={<DashboardRoute><BenchmarkScore /></DashboardRoute>} />
          <Route path="/dashboard/chatbot" element={<DashboardRoute><Chatbot /></DashboardRoute>} />
          <Route path="/dashboard/newsletter" element={<DashboardRoute><BetaLimitedPageGuard><Newsletter /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/newsletter/:id" element={<DashboardRoute><BetaLimitedPageGuard><Newsletter /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/atribuicao" element={<DashboardRoute><Atribuicao /></DashboardRoute>} />
          <Route path="/dashboard/operacoes" element={<DashboardRoute><Operacoes /></DashboardRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </MaintenanceWrapper>
        </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
