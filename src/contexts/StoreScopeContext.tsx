import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

import { supabase } from "@/lib/supabase";
import { pickStoreIdFromList, readPersistedActiveStoreId, writePersistedActiveStoreId } from "@/lib/active-store-id";

export type StoreOption = { id: string; name: string | null };

type StoreQueryResult = {
  stores: StoreOption[];
  effectiveUserId: string;
};

type StoreScopeValue = {
  activeStoreId: string | null;
  storeOptions: StoreOption[];
  setActiveStoreId: (id: string) => void;
  ready: boolean;
  /** The authenticated user's own ID. */
  userId: string | null;
  /** The data-owner ID: equals `userId` for account owners, or the owner's ID when the user is a team member. */
  effectiveUserId: string | null;
};

const StoreScopeContext = createContext<StoreScopeValue | null>(null);

export function useStoreScope(): StoreScopeValue {
  const v = useContext(StoreScopeContext);
  if (!v) throw new Error("useStoreScope deve ser usado dentro de StoreScopeProvider");
  return v;
}

/** Demo, testes ou fora do provider: não falha. */
export function useStoreScopeOptional(): StoreScopeValue | null {
  return useContext(StoreScopeContext);
}

export function StoreScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeStoreId, setActiveState] = useState<string | null>(null);

  const { data: storeData, isSuccess } = useQuery({
    queryKey: ["dashboard-stores-list", user?.id ?? null],
    enabled: !!user,
    queryFn: async (): Promise<StoreQueryResult> => {
      const uid = user!.id;
      const { data: membership } = await supabase
        .from("team_members")
        .select("account_owner_id")
        .eq("invited_user_id", uid)
        .eq("status", "active")
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      const ownerId = (membership as { account_owner_id?: string } | null)?.account_owner_id;
      const storesUserId = ownerId ?? uid;
      const { data, error } = await supabase
        .from("stores")
        .select("id,name")
        .eq("user_id", storesUserId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return {
        stores: (data ?? []) as StoreOption[],
        effectiveUserId: storesUserId,
      };
    },
  });

  const storeRows = storeData?.stores ?? [];
  const resolvedEffectiveUserId = storeData?.effectiveUserId ?? null;

  useEffect(() => {
    if (!isSuccess) return;
    if (storeRows.length === 0) {
      setActiveState(null);
      writePersistedActiveStoreId(null);
      return;
    }
    const ids = storeRows.map((s) => s.id);
    const chosen = pickStoreIdFromList(ids, readPersistedActiveStoreId());
    setActiveState(chosen);
    if (chosen) writePersistedActiveStoreId(chosen);
  }, [isSuccess, storeRows]);

  const setActiveStoreId = useCallback(
    (id: string) => {
      if (!storeRows.some((s) => s.id === id)) return;
      const previousStoreId = activeStoreId;
      writePersistedActiveStoreId(id);
      setActiveState(id);
      // Only invalidate queries scoped to the previous store.
      // Queries keyed by the new storeId re-fetch automatically via queryKey change.
      // A blanket invalidateQueries() fires all 50+ hooks simultaneously → DB pool exhaustion.
      if (previousStoreId && previousStoreId !== id) {
        void qc.invalidateQueries({
          predicate: (query) =>
            Array.isArray(query.queryKey) &&
            (query.queryKey as unknown[]).some((k) => k === previousStoreId),
        });
      }
    },
    [storeRows, qc, activeStoreId],
  );

  const value = useMemo((): StoreScopeValue => {
    if (!user) {
      return {
        activeStoreId: null,
        storeOptions: [],
        setActiveStoreId: () => {},
        ready: true,
        userId: null,
        effectiveUserId: null,
      };
    }
    return {
      activeStoreId,
      storeOptions: storeRows,
      setActiveStoreId,
      ready: isSuccess,
      userId: user.id,
      effectiveUserId: resolvedEffectiveUserId ?? user.id,
    };
  }, [user, activeStoreId, storeRows, setActiveStoreId, isSuccess, resolvedEffectiveUserId]);

  return <StoreScopeContext.Provider value={value}>{children}</StoreScopeContext.Provider>;
}
