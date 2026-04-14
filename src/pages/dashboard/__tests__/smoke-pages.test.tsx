import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type React from "react";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-1" },
    profile: { plan: "starter", trial_ends_at: null },
    loading: false,
    isTrialActive: false,
    isPaid: false,
  }),
}));

vi.mock("@/hooks/useDashboard", () => ({
  useProblems: () => ({ data: { items: [], totalCount: 0, totalEstimatedImpact: 0 } }),
  useDashboardHomeStats: () => ({
    data: {
      revenueLast30: 0,
      revGrowth: 0,
      newContactsLast30: 0,
      conversionRate: 0,
      openConversations: 0,
      totalUnread: 0,
      activeOpportunities: 0,
      avgReadRate: 0,
      totalContacts: 0,
      deliveryRate: 0,
      activeContacts: 0,
      chartData: [],
      chs: 0,
      chsLabel: "Sem dados",
      atRiskCount: 0,
      idealPurchaseCount: 0,
      estimatedRevenue: 0,
    },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useConversionBaseline: () => ({ data: null }),
}));

vi.mock("@/lib/supabase", () => {
  // Chainable builder: every method returns the same object so arbitrary
  // .select().eq().order().limit().single() chains all work without TypeError.
  // Terminal methods (.single, .maybeSingle) and awaiting the chain itself
  // resolve to { data: null, error: null } — enough for smoke renders.
  const resolved = Promise.resolve({ data: null, error: null });
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    in: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    range: () => chain,
    update: () => chain,
    insert: () => chain,
    upsert: () => chain,
    delete: () => chain,
    // Terminal — return resolved promise
    single: () => resolved,
    maybeSingle: () => resolved,
    // Make the chain itself awaitable (needed for direct `await supabase.from(...).eq(...)`)
    then: (cb: (v: unknown) => unknown) => resolved.then(cb),
    catch: (cb: (e: unknown) => unknown) => resolved.catch(cb),
  };
  return {
    supabase: {
      from: () => chain,
      rpc: () => resolved,
      functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
      auth: { getUser: () => resolved },
      channel: () => ({ on: () => ({ subscribe: vi.fn() }), unsubscribe: vi.fn() }),
    },
  };
});

vi.mock("@/components/dashboard/NPSModal", () => ({
  NPSModal: () => <div data-testid="nps-modal" />,
}));
vi.mock("@/components/dashboard/ActivationChecklist", () => ({
  ActivationChecklist: () => <div data-testid="activation-checklist" />,
}));
vi.mock("@/components/dashboard/CHSGauge", () => ({
  CHSGauge: () => <div data-testid="chs-gauge" />,
}));
vi.mock("@/components/dashboard/QuickStartPlaybooks", () => ({
  QuickStartPlaybooks: () => <div data-testid="quick-start-playbooks" />,
}));
vi.mock("@/components/dashboard/ProblemCard", () => ({
  ProblemCard: () => <div data-testid="problem-card" />,
}));
vi.mock("@/components/dashboard/MetricCard", () => ({
  MetricCard: () => <div data-testid="metric-card" />,
}));
vi.mock("@/components/dashboard/ActivityFeed", () => ({
  ActivityFeed: () => <div data-testid="activity-feed" />,
}));
vi.mock("@/components/dashboard/ROIAttribution", () => ({
  ROIAttribution: () => <div data-testid="roi-attribution" />,
}));
vi.mock("@/components/dashboard/DashboardBanners", () => ({
  StreakMilestoneToast: () => null,
  MilestoneToast: () => null,
  WhatsAppPendingBanner: () => null,
  PrescricoesPendingBanner: () => null,
  NewSetupBanner: () => null,
  FirstWeekBanner: () => null,
}));

describe("Dashboard smoke suite", () => {
  it("renderiza o Dashboard sem ReferenceError", async () => {
    const mod = await import("../Dashboard");
    const Dashboard = mod.default;
    render(<Dashboard />);
    expect(screen.getByText(/Radar de/i)).toBeInTheDocument();
  }, 30000);

  it("carrega módulos principais do dashboard", async () => {
    const pages = await Promise.all([
      import("../Inbox"),
      import("../Campanhas"),
      import("../WhatsApp"),
      import("../ConvertIQDiagnostico"),
      import("../ConvertIQPlano"),
      import("../Atribuicao"),
    ]);
    pages.forEach((m) => expect(typeof m.default).toBe("function"));
  }, 60000);

  it("exporta a página Produtos", async () => {
    const m = await import("../Produtos");
    expect(typeof m.default).toBe("function");
  }, 30000);
});

