// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const navigate = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/components/landing/Header", () => ({ default: () => null }));
vi.mock("@/components/landing/Footer", () => ({ default: () => null }));

describe("Diagnostico wizard", () => {
  beforeEach(() => {
    navigate.mockClear();
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    cleanup();
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("desabilita continuar na etapa 1 sem nome da loja", async () => {
    const mod = await import("../Diagnostico");
    const Diagnostico = mod.default;
    render(<Diagnostico embedInDashboard />);
    const next = screen.getByTestId("diagnostico-continuar-numeros");
    expect(next).toBeDisabled();
  }, 15_000);

  it("habilita continuar após preencher nome da loja", async () => {
    const mod = await import("../Diagnostico");
    const Diagnostico = mod.default;
    render(<Diagnostico embedInDashboard />);
    const nome = screen.getByLabelText(/Nome da loja/i);
    fireEvent.change(nome, { target: { value: "Loja Teste" } });
    const next = screen.getByTestId("diagnostico-continuar-numeros");
    expect(next).not.toBeDisabled();
  }, 15_000);
});
