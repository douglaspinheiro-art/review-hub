/* mocks parciais de useInfiniteQuery */
import type { ComponentType } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useConversations } from "@/hooks/useDashboard";
import Inbox from "../Inbox";

const convInfiniteEmpty = {
  data: { pages: [[]], pageParams: [0] },
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
  hasNextPage: false,
  isFetchingNextPage: false,
};

vi.mock("@/hooks/useDashboard", () => ({
  INBOX_MESSAGES_DEFAULT_LIMIT: 200,
  INBOX_MESSAGES_MAX_LIMIT: 2000,
  INBOX_MESSAGES_LOAD_STEP: 100,
  getCurrentUserAndStore: vi.fn().mockResolvedValue({
    userId: "u1",
    storeId: "s1",
    effectiveUserId: "owner-1",
  }),
  useConversations: vi.fn(() => convInfiniteEmpty),
  useMessages: vi.fn(() => ({
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
  useConversationIdsByMessageSearch: vi.fn(() => ({
    data: [],
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  })),
  useInboxRoutingSettings: vi.fn(() => ({
    data: { agent_names: ["Ana"], round_robin_index: 0 },
  })),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1" },
    profile: { full_name: "Ana Operadora", plan: "growth", trial_ends_at: null },
    loading: false,
    isTrialActive: false,
    isPaid: true,
  }),
}));

vi.mock("@/hooks/useWhatsAppSender", () => ({
  useWhatsAppSender: () => ({
    connection: null,
    isReady: false,
    isLoading: false,
    sendMessage: vi.fn(),
    sendTemplateButton: vi.fn(),
    sendFlowMessage: vi.fn(),
    refreshConnectionStatus: vi.fn(),
  }),
}));

vi.mock("@/lib/moat-telemetry", () => ({
  trackMoatEvent: vi.fn(),
}));

// useVirtualizer needs real DOM dimensions which JSDOM does not provide.
// Mock it to always render all items so conversation list tests work.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: getItemKey ? getItemKey(i) : i,
        start: i * 80,
        size: 80,
        lane: 0,
      })),
    getTotalSize: () => count * 80,
    measureElement: () => undefined,
    scrollToIndex: () => undefined,
  }),
}));

vi.mock("@/lib/supabase", () => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  };
  return {
    supabase: {
      channel: vi.fn(() => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn(),
      })),
      removeChannel: vi.fn(),
      from: vi.fn(() => chain),
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: { suggestion: null }, error: null }),
      },
    },
  };
});

function renderInbox(InboxCmp: ComponentType) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <InboxCmp />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConversations).mockReturnValue(convInfiniteEmpty as unknown as ReturnType<typeof useConversations>);
  });

  it("renderiza título e filtros de status", () => {
    renderInbox(Inbox);
    expect(screen.getByRole("heading", { name: /Conversas/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Abertas$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Minhas$/i })).toBeInTheDocument();
  });

  it("lista conversas quando o hook retorna páginas", async () => {
    vi.mocked(useConversations).mockReturnValue({
      data: {
        pages: [
          [
            {
              id: "c1",
              status: "open",
              unread_count: 1,
              last_message: "Oi",
              last_message_at: new Date().toISOString(),
              sla_due_at: null,
              contacts: { name: "Cliente", phone: "5511999999999" },
            },
          ],
        ],
        pageParams: [0],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as unknown as ReturnType<typeof useConversations>);

    renderInbox(Inbox);

    expect(await screen.findByText("Cliente")).toBeInTheDocument();
  });
});
