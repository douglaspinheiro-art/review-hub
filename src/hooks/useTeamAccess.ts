import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";

export type TeamCollaboratorRole = "admin" | "operator" | "viewer";

export type TeamAccessState =
  | { mode: "owner" }
  | { mode: "collaborator"; role: TeamCollaboratorRole };

export function useTeamAccess() {
  const { user } = useAuth();
  const scope = useStoreScopeOptional();
  return useQuery({
    queryKey: ["team_access", user?.id ?? null],
    queryFn: async (): Promise<TeamAccessState> => {
      if (!user) return { mode: "owner" };
      const userId = scope?.userId ?? null;
      const effectiveUserId = scope?.effectiveUserId ?? null;
      if (!userId || !effectiveUserId) return { mode: "owner" };
      if (userId === effectiveUserId) return { mode: "owner" };

      const { data, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("invited_user_id", user.id)
        .eq("account_owner_id", effectiveUserId)
        .eq("status", "active")
        .maybeSingle();

      if (error || !data) return { mode: "collaborator", role: "operator" };
      const r = (data as { role: string }).role;
      if (r === "admin" || r === "operator" || r === "viewer") {
        return { mode: "collaborator", role: r };
      }
      return { mode: "collaborator", role: "operator" };
    },
    enabled: !!user && scope?.ready === true,
    staleTime: 60_000,
  });
}

/** Esconde itens do menu lateral conforme papel na loja (não proprietário). */
export function teamNavItemHidden(href: string, access: TeamAccessState | undefined): boolean {
  if (!access || access.mode === "owner") return false;
  const r = access.role;

  const hideForAllCollaborators = [
    "/dashboard/billing",
    "/dashboard/planos",
    "/dashboard/equipe",
    "/dashboard/api-keys",
    "/dashboard/white-label",
    "/dashboard/afiliados",
    "/dashboard/operacoes",
  ];

  if (hideForAllCollaborators.some((p) => href === p || href.startsWith(`${p}/`))) {
    return true;
  }

  if (r === "viewer") {
    const viewerHide = [
      "/dashboard/campanhas",
      "/dashboard/inbox",
      "/dashboard/automacoes",
      "/dashboard/carrinho-abandonado",
      "/dashboard/newsletter",
      "/dashboard/agente-ia",
      "/dashboard/chatbot",
      "/dashboard/configuracoes",
      "/dashboard/integracoes",
      "/dashboard/whatsapp",
    ];
    if (viewerHide.some((p) => href === p || href.startsWith(`${p}/`))) return true;
  }

  if (r === "operator") {
    const opHide = ["/dashboard/automacoes", "/dashboard/configuracoes"];
    if (opHide.some((p) => href === p || href.startsWith(`${p}/`))) return true;
  }

  return false;
}
