import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import ProtectedRoute from "./components/ProtectedRoute.tsx";
import DashboardLayout from "./components/dashboard/DashboardLayout.tsx";
import { useAuth } from "@/hooks/useAuth";
import { useSistemaConfig } from "@/hooks/useSistemaConfig";
import TelaManutencao from "./components/TelaManutencao";

const queryClient = new QueryClient();

function MaintenanceWrapper({ children }: { children: React.ReactNode }) {
  const { data: config } = useSistemaConfig();
  const { profile } = useAuth();
  
  const isManutencao = config?.manutencao_ativa;
  const isAdmin = profile?.role === "admin";

  if (isManutencao && !isAdmin) {
    return <TelaManutencao mensagem={config?.mensagem_manutencao} />;
  }

  return <>{children}</>;
}

function DashboardRoute({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
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
const Planos = lazy(() => import("./pages/Planos.tsx"));
const Pontos = lazy(() => import("./pages/portal/Pontos.tsx"));
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
          <Route path="/planos" element={<Planos />} />
          <Route path="/pontos/:slug" element={<Pontos />} />

          {/* Protected dashboard */}
          <Route path="/dashboard" element={<DashboardRoute><Dashboard /></DashboardRoute>} />
          <Route path="/dashboard/prescricoes" element={<DashboardRoute><Prescricoes /></DashboardRoute>} />
          <Route path="/dashboard/funil" element={<DashboardRoute><Funil /></DashboardRoute>} />
          <Route path="/dashboard/produtos" element={<DashboardRoute><Produtos /></DashboardRoute>} />
          <Route path="/dashboard/canais" element={<DashboardRoute><Canais /></DashboardRoute>} />
          <Route path="/dashboard/forecast" element={<ProtectedRoute requiredPlan="growth"><DashboardLayout><Forecast /></DashboardLayout></ProtectedRoute>} />
          <Route path="/dashboard/em-execucao" element={<DashboardRoute><EmExecucao /></DashboardRoute>} />
          <Route path="/dashboard/inbox" element={<DashboardRoute><Inbox /></DashboardRoute>} />
          <Route path="/dashboard/campanhas" element={<DashboardRoute><Campanhas /></DashboardRoute>} />
          <Route path="/dashboard/contatos" element={<DashboardRoute><Contatos /></DashboardRoute>} />
          <Route path="/dashboard/rfm" element={<DashboardRoute><RFM /></DashboardRoute>} />
          <Route path="/dashboard/automacoes" element={<DashboardRoute><Automacoes /></DashboardRoute>} />
          <Route path="/dashboard/chatbot" element={<DashboardRoute><Chatbot /></DashboardRoute>} />
          <Route path="/dashboard/carrinhos" element={<DashboardRoute><CarrinhoAbandonado /></DashboardRoute>} />
          <Route path="/dashboard/reviews" element={<DashboardRoute><Reviews /></DashboardRoute>} />
          <Route path="/dashboard/analytics" element={<DashboardRoute><Analytics /></DashboardRoute>} />
          <Route path="/dashboard/whatsapp" element={<DashboardRoute><WhatsApp /></DashboardRoute>} />
          <Route path="/dashboard/configuracoes" element={<DashboardRoute><Configuracoes /></DashboardRoute>} />
          <Route path="/dashboard/billing" element={<DashboardRoute><Billing /></DashboardRoute>} />
          <Route path="/dashboard/api-keys" element={<DashboardRoute><ApiKeys /></DashboardRoute>} />
          <Route path="/dashboard/white-label" element={<DashboardRoute><WhiteLabel /></DashboardRoute>} />
          <Route path="/dashboard/integracoes" element={<DashboardRoute><Integracoes /></DashboardRoute>} />
          <Route path="/dashboard/equipe" element={<DashboardRoute><Equipe /></DashboardRoute>} />
          <Route path="/dashboard/afiliados" element={<DashboardRoute><Afiliados /></DashboardRoute>} />
          <Route path="/dashboard/fidelidade" element={<DashboardRoute><Fidelidade /></DashboardRoute>} />
          <Route path="/dashboard/relatorios" element={<DashboardRoute><Relatorios /></DashboardRoute>} />

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
