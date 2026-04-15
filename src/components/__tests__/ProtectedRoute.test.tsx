import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";

const mockUseAuth = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ data: false });

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

function renderRoute(element: ReactNode, initialPath = "/dashboard/forecast") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/dashboard/forecast" element={element} />
        <Route path="/planos" element={<div>Planos</div>} />
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute business rules", () => {
  beforeEach(() => {
    mockRpc.mockResolvedValue({ data: false });
  });

  it("redirects to login when unauthenticated", () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, loading: false });
    renderRoute(<ProtectedRoute><div>Private</div></ProtectedRoute>);
    expect(screen.getByText("Login")).toBeInTheDocument();
  });

  it("fails safe for paid route when profile is missing", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1" },
      profile: null,
      loading: false,
    });
    renderRoute(<ProtectedRoute requiredPlan="growth"><div>Private</div></ProtectedRoute>);
    await waitFor(() => {
      expect(screen.getByText("Planos")).toBeInTheDocument();
    });
  });

  it("allows access when plan requirement is satisfied", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1" },
      profile: { plan: "scale" },
      loading: false,
    });
    renderRoute(<ProtectedRoute requiredPlan="growth"><div>Private</div></ProtectedRoute>);
    await waitFor(() => {
      expect(screen.getByText("Private")).toBeInTheDocument();
    });
  });
});
