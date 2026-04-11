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
import { useDemo } from "@/contexts/DemoContext";
import { supabase } from "@/lib/supabase";
import { pickStoreIdFromList, readPersistedActiveStoreId, writePersistedActiveStoreId } from "@/lib/active-store-id";

export type StoreOption = { id: string; name: string | null };

type StoreScopeValue = {
  activeStoreId: string | null;
  storeOptions: StoreOption[];
  setActiveStoreId: (id: string) => void;
  ready: boolean;
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
  const { isDemo } = useDemo();
  const qc = useQueryClient();
  const [activeStoreId, setActiveState] = useState<string | null>(null);

  const { data: storeRows = [], isSuccess } = useQuery({
    queryKey: ["dashboard-stores-list", user?.id ?? null],
    enabled: !!user && !isDemo,
    queryFn: async (): Promise<StoreOption[]> => {
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
      return (data ?? []) as StoreOption[];
    },
  });

  useEffect(() => {
    if (isDemo || !isSuccess) return;
    if (storeRows.length === 0) {
      setActiveState(null);
      writePersistedActiveStoreId(null);
      return;
    }
    const ids = storeRows.map((s) => s.id);
    const chosen = pickStoreIdFromList(ids, readPersistedActiveStoreId());
    setActiveState(chosen);
    if (chosen) writePersistedActiveStoreId(chosen);
  }, [isDemo, isSuccess, storeRows]);

  const setActiveStoreId = useCallback(
    (id: string) => {
      if (!storeRows.some((s) => s.id === id)) return;
      writePersistedActiveStoreId(id);
      setActiveState(id);
      void qc.invalidateQueries();
    },
    [storeRows, qc],
  );

  const value = useMemo((): StoreScopeValue => {
    if (isDemo || !user) {
      return {
        activeStoreId: null,
        storeOptions: [],
        setActiveStoreId: () => {},
        ready: true,
      };
    }
    return {
      activeStoreId,
      storeOptions: storeRows,
      setActiveStoreId,
      ready: isSuccess,
    };
  }, [isDemo, user, activeStoreId, storeRows, setActiveStoreId, isSuccess]);

  return <StoreScopeContext.Provider value={value}>{children}</StoreScopeContext.Provider>;
}
