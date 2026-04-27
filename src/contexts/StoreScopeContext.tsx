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

export type AdminImpersonation = {
  targetUserId: string;
  targetStoreId: string;
  storeName: string;
  expiresAt: string; // ISO
  writeEnabled: boolean;
};

const ADMIN_IMP_KEY = "ltv_admin_imp";

function readImpersonation(): AdminImpersonation | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_IMP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AdminImpersonation;
    if (!parsed?.expiresAt || new Date(parsed.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(ADMIN_IMP_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeImpersonation(value: AdminImpersonation | null) {
  try {
    if (value) sessionStorage.setItem(ADMIN_IMP_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(ADMIN_IMP_KEY);
  } catch { /* noop */ }
}

type StoreScopeValue = {
  activeStoreId: string | null;
  storeOptions: StoreOption[];
  setActiveStoreId: (id: string) => void;
  ready: boolean;
  /** The authenticated user's own ID. */
  userId: string | null;
  /** The data-owner ID: equals `userId` for account owners, or the owner's ID when the user is a team member. */
  effectiveUserId: string | null;
  /** Active admin impersonation session, if any. */
  adminImpersonating: AdminImpersonation | null;
  adminEnterStore: (storeId: string) => Promise<void>;
  adminExitStore: () => Promise<void>;
  adminSetWriteMode: (enabled: boolean) => Promise<void>;
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
  const [adminImp, setAdminImp] = useState<AdminImpersonation | null>(() => readImpersonation());

  const { data: storeData, isSuccess } = useQuery({
    queryKey: ["dashboard-stores-list", user?.id ?? null, adminImp?.targetUserId ?? null],
    enabled: !!user,
    queryFn: async (): Promise<StoreQueryResult> => {
      const uid = user!.id;
      // Admin impersonation: scope all queries to the target user/store.
      if (adminImp) {
        const { data, error } = await supabase
          .from("stores")
          .select("id,name")
          .eq("user_id", adminImp.targetUserId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return {
          stores: (data ?? []) as StoreOption[],
          effectiveUserId: adminImp.targetUserId,
        };
      }
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
    // While impersonating, lock the active store to the impersonated one.
    if (adminImp) {
      setActiveState(adminImp.targetStoreId);
      return;
    }
    if (storeRows.length === 0) {
      setActiveState(null);
      writePersistedActiveStoreId(null);
      return;
    }
    const ids = storeRows.map((s) => s.id);
    const chosen = pickStoreIdFromList(ids, readPersistedActiveStoreId());
    setActiveState(chosen);
    if (chosen) writePersistedActiveStoreId(chosen);
  }, [isSuccess, storeRows, adminImp]);

  // Auto-expire impersonation: poll every 30s, exit when expired.
  useEffect(() => {
    if (!adminImp) return;
    const checkExpiry = () => {
      if (new Date(adminImp.expiresAt).getTime() <= Date.now()) {
        writeImpersonation(null);
        setAdminImp(null);
        qc.clear();
        try {
          // best-effort server cleanup
          void supabase.rpc("admin_exit_store");
        } catch { /* noop */ }
      }
    };
    checkExpiry();
    const id = window.setInterval(checkExpiry, 30_000);
    return () => window.clearInterval(id);
  }, [adminImp, qc]);

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

  const adminEnterStore = useCallback(async (storeId: string) => {
    const { data, error } = await supabase.rpc("admin_enter_store", { p_store_id: storeId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("admin_enter_store: empty response");
    const next: AdminImpersonation = {
      targetUserId: row.target_user_id as string,
      targetStoreId: storeId,
      storeName: (row.target_store_name as string) ?? "Loja",
      expiresAt: new Date(row.expires_at as string).toISOString(),
      writeEnabled: false,
    };
    writeImpersonation(next);
    setAdminImp(next);
    qc.clear();
  }, [qc]);

  const adminExitStore = useCallback(async () => {
    try { await supabase.rpc("admin_exit_store"); } catch { /* swallow */ }
    writeImpersonation(null);
    setAdminImp(null);
    qc.clear();
  }, [qc]);

  const adminSetWriteMode = useCallback(async (enabled: boolean) => {
    const { error } = await supabase.rpc("admin_set_write_mode", { p_enabled: enabled });
    if (error) throw error;
    setAdminImp((prev) => {
      if (!prev) return prev;
      const next = { ...prev, writeEnabled: enabled };
      writeImpersonation(next);
      return next;
    });
  }, []);

  const value = useMemo((): StoreScopeValue => {
    if (!user) {
      return {
        activeStoreId: null,
        storeOptions: [],
        setActiveStoreId: () => {},
        ready: true,
        userId: null,
        effectiveUserId: null,
        adminImpersonating: null,
        adminEnterStore: async () => {},
        adminExitStore: async () => {},
        adminSetWriteMode: async () => {},
      };
    }
    return {
      activeStoreId,
      storeOptions: storeRows,
      setActiveStoreId,
      ready: isSuccess,
      userId: user.id,
      effectiveUserId: resolvedEffectiveUserId ?? user.id,
      adminImpersonating: adminImp,
      adminEnterStore,
      adminExitStore,
      adminSetWriteMode,
    };
  }, [user, activeStoreId, storeRows, setActiveStoreId, isSuccess, resolvedEffectiveUserId,
      adminImp, adminEnterStore, adminExitStore, adminSetWriteMode]);

  return <StoreScopeContext.Provider value={value}>{children}</StoreScopeContext.Provider>;
}
