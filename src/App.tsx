import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary, { RouteErrorBoundary } from "./components/ErrorBoundary.tsx";
import { BetaLimitedPageGuard } from "./components/BetaLimitedPageGuard.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import DashboardLayout from "./components/dashboard/DashboardLayout.tsx";
import AdminStaffRoute from "./components/AdminStaffRoute.tsx";
import { useSistemaConfig } from "@/hooks/useSistemaConfig";
import { useIsAdmin } from "@/hooks/useAdminCheck";
import { useTeamAccess } from "@/hooks/useTeamAccess";
import TelaManutencao from "./components/TelaManutencao";

import { AuthProvider } from "./contexts/AuthContext.tsx";
import { MercadoPagoCheckoutProvider } from "./hooks/useMercadoPagoCheckout";

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
    return <TelaManutencao mensagem={config?.maintenance_message ?? undefined} />;
  }

  return <>{children}</>;
}

function DashboardRoute({ children, requiredPlan, routeLabel }: { children: React.ReactNode; requiredPlan?: "starter" | "growth" | "scale" | "enterprise"; routeLabel?: string }) {
  return (
    <ProtectedRoute requiredPlan={requiredPlan} requirePaidSubscription>
      <DashboardLayout>
        <RouteErrorBoundary routeLabel={routeLabel}>
          {children}
        </RouteErrorBoundary>
      </DashboardLayout>
    </ProtectedRoute>
  );
}

/**
 * Blocks team collaborators (non-owners) from accessing owner-only routes such
 * as billing and API keys. Sidebar hides these links, but a direct URL would
 * bypass that. Redirects to /dashboard with a warning toast.
 */
function OwnerOnlyRoute({ children }: { children: React.ReactNode }) {
  const { data: teamAccess, isLoading } = useTeamAccess();
  if (isLoading) return null;
  if (teamAccess?.mode === "collaborator") {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
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
const Setup = lazy(() => import("./pages/Setup.tsx"));
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
const DiagnosticoCompartilhado = lazy(() => import("./pages/DiagnosticoCompartilhado.tsx"));
const Calculadora = lazy(() => import("./pages/Calculadora.tsx"));
const Benchmark = lazy(() => import("./pages/Benchmark.tsx"));
const PlanosPage = lazy(() => import("./pages/Planos.tsx"));
const Upgrade = lazy(() => import("./pages/Upgrade.tsx"));
const ResetPassword = lazy(() => import("./pages/ResetPassword.tsx"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe.tsx"));
const AceitarConviteEquipe = lazy(() => import("./pages/AceitarConviteEquipe.tsx"));
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
const ConvertIQSetup = lazy(() => import("./pages/dashboard/ConvertIQSetup.tsx"));
const Newsletter = lazy(() => import("./pages/dashboard/Newsletter.tsx"));
const Atribuicao = lazy(() => import("./pages/dashboard/Atribuicao.tsx"));
const Operacoes = lazy(() => import("./pages/dashboard/Operacoes.tsx"));
const Admin = lazy(() => import("./pages/admin/Admin.tsx"));
const DiagnosticoTelemetria = lazy(() => import("./pages/admin/DiagnosticoTelemetria.tsx"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <MercadoPagoCheckoutProvider>
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
          <Route path="/setup" element={<ProtectedRoute requirePaidSubscription><Setup /></ProtectedRoute>} />
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
          <Route path="/planos" element={<PlanosPage />} />
          <Route path="/planos/simulador" element={<PlanosPage defaultTab="simulador" />} />
          <Route path="/upgrade" element={<Upgrade />} />
          {/* Signup funnel lands on /resultado (inline checkout); this path stays dashboard + paid via DashboardRoute. */}
          <Route path="/diagnostico" element={<Navigate to="/dashboard/diagnostico" replace />} />
          <Route path="/dashboard/diagnostico" element={<DashboardRoute routeLabel="Simulador de receita"><Diagnostico embedInDashboard /></DashboardRoute>} />
          <Route path="/calculadora-abandono-carrinho" element={<Calculadora />} />
          <Route path="/benchmark" element={<Benchmark />} />
          <Route path="/afiliados" element={<AfiliadosPublico />} />
          <Route path="/agencias" element={<Navigate to="/afiliados" replace />} />
          <Route path="/relatorio-anual" element={<RelatorioAnual />} />
          <Route path="/pontos/:slug" element={<Pontos />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/aceitar-convite" element={<AceitarConviteEquipe />} />
          <Route path="/d/:token" element={<DiagnosticoCompartilhado />} />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={<DashboardRoute routeLabel="Dashboard Home"><Dashboard /></DashboardRoute>} />
          <Route path="/dashboard/prescricoes" element={<DashboardRoute routeLabel="Central de Prescrições"><Prescricoes /></DashboardRoute>} />
          <Route path="/dashboard/funil" element={<DashboardRoute routeLabel="Funil de Conversão"><Funil /></DashboardRoute>} />
          <Route path="/dashboard/funil/diagnostico" element={<DashboardRoute routeLabel="Diagnóstico ConvertIQ"><ConvertIQDiagnostico /></DashboardRoute>} />
          <Route path="/dashboard/funil/plano" element={<DashboardRoute routeLabel="Plano Estratégico"><ConvertIQPlano /></DashboardRoute>} />
          <Route path="/dashboard/convertiq" element={<Navigate to="/dashboard/funil" replace />} />
          <Route path="/dashboard/convertiq/diagnostico" element={<Navigate to="/dashboard/funil/diagnostico" replace />} />
          <Route path="/dashboard/convertiq/plano" element={<Navigate to="/dashboard/funil/plano" replace />} />
          <Route path="/dashboard/convertiq/setup" element={<DashboardRoute routeLabel="Configuração ConvertIQ"><ConvertIQSetup /></DashboardRoute>} />
          <Route path="/dashboard/produtos" element={<DashboardRoute routeLabel="Catálogo de Produtos"><Produtos /></DashboardRoute>} />
          <Route path="/dashboard/canais" element={<DashboardRoute routeLabel="Configuração de Canais"><Canais /></DashboardRoute>} />
          <Route path="/dashboard/forecast" element={<DashboardRoute routeLabel="Previsão de Receita" requiredPlan="growth"><Forecast /></DashboardRoute>} />
          <Route path="/dashboard/em-execucao" element={<DashboardRoute routeLabel="Em Execução"><EmExecucao /></DashboardRoute>} />
          <Route path="/dashboard/inbox" element={<DashboardRoute routeLabel="Central de Atendimento (Inbox)"><BetaLimitedPageGuard><Inbox /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/campanhas" element={<DashboardRoute routeLabel="Gestão de Campanhas"><BetaLimitedPageGuard><Campanhas /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/contatos" element={<DashboardRoute routeLabel="Base de Contatos"><Contatos /></DashboardRoute>} />
          <Route path="/dashboard/rfm" element={<DashboardRoute routeLabel="Matriz RFM"><RFM /></DashboardRoute>} />
          <Route path="/dashboard/automacoes" element={<DashboardRoute routeLabel="Automações Inteligentes"><BetaLimitedPageGuard><Automacoes /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/carrinho-abandonado" element={<DashboardRoute routeLabel="Carrinho Abandonado"><BetaLimitedPageGuard><CarrinhoAbandonado /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/carrinhos" element={<Navigate to="/dashboard/carrinho-abandonado" replace />} />
          <Route path="/dashboard/agente-ia" element={<DashboardRoute routeLabel="Agente de IA"><AgenteIA /></DashboardRoute>} />
          <Route path="/dashboard/reviews" element={<DashboardRoute routeLabel="Gestão de Avaliações"><Reviews /></DashboardRoute>} />
          <Route path="/dashboard/analytics" element={<DashboardRoute routeLabel="Analytics e Insights"><Analytics /></DashboardRoute>} />
          <Route path="/dashboard/whatsapp" element={<DashboardRoute routeLabel="Integração WhatsApp"><BetaLimitedPageGuard><WhatsApp /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/configuracoes" element={<DashboardRoute routeLabel="Configurações da Conta"><Configuracoes /></DashboardRoute>} />
          <Route path="/dashboard/planos" element={<DashboardRoute routeLabel="Planos e preços"><PlanosPage embedInDashboard /></DashboardRoute>} />
          <Route path="/dashboard/planos/simulador" element={<DashboardRoute routeLabel="Simulador de impacto"><PlanosPage embedInDashboard defaultTab="simulador" /></DashboardRoute>} />
          <Route path="/dashboard/billing" element={<DashboardRoute routeLabel="Fatura e Assinatura"><OwnerOnlyRoute><Billing /></OwnerOnlyRoute></DashboardRoute>} />
          <Route path="/dashboard/api-keys" element={<DashboardRoute routeLabel="Chaves de API" requiredPlan="scale"><OwnerOnlyRoute><ApiKeys /></OwnerOnlyRoute></DashboardRoute>} />
          <Route path="/dashboard/white-label" element={<DashboardRoute routeLabel="Painel White Label" requiredPlan="scale"><WhiteLabel /></DashboardRoute>} />
          <Route path="/dashboard/integracoes" element={<DashboardRoute routeLabel="Ecossistema de Integrações"><Integracoes /></DashboardRoute>} />
          <Route path="/dashboard/equipe" element={<DashboardRoute routeLabel="Membros da Equipe" requiredPlan="growth"><Equipe /></DashboardRoute>} />
          <Route path="/dashboard/afiliados" element={<DashboardRoute routeLabel="Gestão de Afiliados" requiredPlan="scale"><Afiliados /></DashboardRoute>} />
          <Route path="/dashboard/fidelidade" element={<DashboardRoute routeLabel="Programa de Fidelidade" requiredPlan="growth"><Fidelidade /></DashboardRoute>} />
          <Route path="/dashboard/relatorios" element={<DashboardRoute routeLabel="Relatórios Consolidados" requiredPlan="growth"><Relatorios /></DashboardRoute>} />
          <Route path="/dashboard/benchmark" element={<DashboardRoute routeLabel="Benchmark do Setor"><BenchmarkScore /></DashboardRoute>} />
          <Route path="/dashboard/chatbot" element={<DashboardRoute routeLabel="Construtor de Chatbot"><Chatbot /></DashboardRoute>} />
          <Route path="/dashboard/newsletter" element={<DashboardRoute routeLabel="Newsletter Builder"><BetaLimitedPageGuard><Newsletter /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/newsletter/:id" element={<DashboardRoute routeLabel="Edição de Newsletter"><BetaLimitedPageGuard><Newsletter /></BetaLimitedPageGuard></DashboardRoute>} />
          <Route path="/dashboard/atribuicao" element={<DashboardRoute routeLabel="Atribuição de Vendas"><Atribuicao /></DashboardRoute>} />
          <Route path="/dashboard/operacoes" element={<DashboardRoute routeLabel="Operações Logísticas"><Operacoes /></DashboardRoute>} />
          <Route path="/admin" element={<AdminStaffRoute routeLabel="Administração da plataforma"><Admin /></AdminStaffRoute>} />
          <Route path="/admin/diagnostico-telemetria" element={<AdminStaffRoute routeLabel="Telemetria de diagnósticos"><DiagnosticoTelemetria /></AdminStaffRoute>} />

          <Route path="*" element={<NotFound />} />
        </Routes>
        </MaintenanceWrapper>
        </Suspense>
        </ErrorBoundary>
        </MercadoPagoCheckoutProvider>
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
