import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: [], isLoading: false }),
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
  useProblems: () => ({ data: [] }),
  useDashboardStats: () => ({ data: { revenueLast30: 0, revGrowth: 0 } }),
  useConversionBaseline: () => ({ data: null }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => [],
      }),
    }),
  },
}));

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
    ]);
    pages.forEach((m) => expect(typeof m.default).toBe("function"));
  }, 60000);
});

