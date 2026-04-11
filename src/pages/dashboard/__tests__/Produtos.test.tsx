import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ProductRow } from "@/hooks/useLTVBoost";

const useLojaMock = vi.fn();
const useProductsV3Mock = vi.fn();

vi.mock("@/hooks/useConvertIQ", () => ({
  useLoja: () => useLojaMock(),
}));

vi.mock("@/hooks/useLTVBoost", () => ({
  useProductsV3: (_storeId?: string, _filter?: string) => useProductsV3Mock(),
}));

vi.mock("@/components/dashboard/CampaignModal", () => ({
  __esModule: true,
  default: () => null,
}));

function renderProdutos() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Produtos />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

let Produtos: typeof import("../Produtos").default;

describe("Produtos", () => {
  beforeEach(async () => {
    vi.resetModules();
    useLojaMock.mockReset();
    useProductsV3Mock.mockReset();
    const mod = await import("../Produtos");
    Produtos = mod.default;
  });

  it("pede configuração da loja quando não há store (não usa profile.id como store)", async () => {
    useLojaMock.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useProductsV3Mock.mockReturnValue({
      data: { rows: [], total: 0 },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderProdutos();

    expect(screen.getByRole("link", { name: /Concluir configuração da loja/i })).toHaveAttribute(
      "href",
      "/onboarding"
    );
    expect(screen.queryByText(/Monitorados/i)).not.toBeInTheDocument();
  });

  it("com loja carregada, usa dados de produtos e mostra listagem", async () => {
    const row: ProductRow = {
      id: "p1",
      nome: "Produto Teste",
      sku: "SKU-1",
      store_id: "s1",
      user_id: "u1",
      categoria: "Calçados",
      estoque: 10,
      media_avaliacao: 4.2,
      taxa_conversao_produto: 12,
      receita_30d: 1500,
      num_visualizacoes: 100,
      num_vendas: 5,
      imagem_url: null,
      preco: 99,
      custo: null,
      canal_id: null,
      created_at: null,
      updated_at: null,
      estoque_critico: false,
      num_adicionados_carrinho: null,
      num_avaliacoes: null,
      produto_externo_id: null,
    };

    useLojaMock.mockReturnValue({
      data: { id: "s1", name: "Loja" },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useProductsV3Mock.mockReturnValue({
      data: { rows: [row], total: 1 },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderProdutos();

    expect(screen.getAllByText("Produto Teste").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Calçados/i).length).toBeGreaterThanOrEqual(1);
  });
});
