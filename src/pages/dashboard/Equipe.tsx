import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, UserPlus, Mail, Shield, Eye, Loader2,
  Trash2, Clock, Check, Crown, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TeamMember = {
  id: string;
  account_owner_id: string;
  invited_email: string;
  invited_user_id: string | null;
  role: "admin" | "operator" | "viewer";
  status: "pending" | "active" | "revoked";
  invited_at: string;
  accepted_at: string | null;
};

const ROLES = [
  {
    value: "admin",
    label: "Admin",
    description: "Acesso total exceto faturamento",
    icon: Crown,
    color: "bg-purple-50 text-purple-700 border-purple-200",
  },
  {
    value: "operator",
    label: "Operador",
    description: "Envia campanhas e responde conversas",
    icon: Shield,
    color: "bg-blue-50 text-blue-700 border-blue-200",
  },
  {
    value: "viewer",
    label: "Visualizador",
    description: "Apenas leitura de relatórios",
    icon: Eye,
    color: "bg-muted text-muted-foreground border-border",
  },
] as const;

function roleCfg(role: string) {
  return ROLES.find((r) => r.value === role) ?? ROLES[1];
}

export default function Equipe() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPaid = profile?.plan !== "starter";

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operator" | "viewer">("operator");

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["team_members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("account_owner_id", user!.id)
        .order("invited_at", { ascending: false });
      if (error) return [] as TeamMember[];
      return (data ?? []) as TeamMember[];
    },
    enabled: !!user && isPaid,
  });

  const inviteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("team_members").insert({
        account_owner_id: user!.id,
        invited_email: email.trim().toLowerCase(),
        role,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Convite enviado!", description: `${email} receberá um e-mail com o link de acesso.` });
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
    onError: (err: Error) => {
      const isDuplicate = err?.message?.includes("unique");
      toast({
        title: isDuplicate ? "Usuário já convidado" : "Erro ao enviar convite",
        variant: "destructive",
      });
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, newRole }: { id: string; newRole: string }) => {
      const { error } = await supabase.from("team_members").update({ role: newRole }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team_members"] }),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("team_members").update({ status: "revoked" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Acesso revogado" });
      queryClient.invalidateQueries({ queryKey: ["team_members"] });
    },
  });

  if (!isPaid) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-muted-foreground text-sm mt-1">Convide colaboradores para gerenciar o LTV Boost</p>
        </div>
        <div className="bg-card border rounded-xl p-8 flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">Equipe disponível nos planos Crescimento e superiores</p>
            <p className="text-sm text-muted-foreground mt-1">
              Faça upgrade para convidar até 5 membros (Crescimento) ou ilimitados (Escala/Enterprise).
            </p>
          </div>
          <Button asChild>
            <a href="/dashboard/billing">Ver planos</a>
          </Button>
        </div>
      </div>
    );
  }

  const active = members.filter((m) => m.status === "active").length;
  const pending = members.filter((m) => m.status === "pending").length;
  const limit = profile?.plan === "growth" ? 5 : 999;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Equipe</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Convide colaboradores e defina o nível de acesso de cada um
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Ativos</p>
          <p className="text-2xl font-bold text-primary">{active}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Aguardando</p>
          <p className="text-2xl font-bold text-yellow-600">{pending}</p>
        </div>
        <div className="bg-card border rounded-xl p-4">
          <p className="text-xs text-muted-foreground">Limite do plano</p>
          <p className="text-2xl font-bold">{limit === 999 ? "∞" : limit}</p>
        </div>
      </div>

      {/* Invite form */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Convidar membro</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input
              type="email"
              placeholder="colaborador@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email && inviteMutation.mutate()}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Função</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>{r.label} — {r.description}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Role info */}
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map(({ value, label, description, icon: Icon, color }) => (
            <button
              key={value}
              onClick={() => setRole(value)}
              className={cn(
                "text-left border rounded-lg p-3 transition-colors space-y-1",
                role === value ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40"
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold">{label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{description}</p>
            </button>
          ))}
        </div>

        <Button
          className="gap-2"
          onClick={() => inviteMutation.mutate()}
          disabled={!email.includes("@") || inviteMutation.isPending || active >= limit}
        >
          {inviteMutation.isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Mail className="w-4 h-4" />
          }
          Enviar convite
        </Button>
        {active >= limit && (
          <p className="text-xs text-orange-600">Limite de membros atingido. Faça upgrade para adicionar mais.</p>
        )}
      </div>

      {/* Members list */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">Membros da equipe</h2>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Users className="w-8 h-8 opacity-20" />
            <p className="text-sm">Nenhum membro convidado ainda</p>
          </div>
        ) : (
          <div className="divide-y">
            {/* Owner row */}
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {(profile?.full_name ?? user?.email ?? "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{profile?.full_name ?? user?.email}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                Proprietário
              </Badge>
            </div>

            {members.map((m) => {
              const rc = roleCfg(m.role);
              const RoleIcon = rc.icon;
              return (
                <div key={m.id} className="px-5 py-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-bold text-sm shrink-0">
                    {m.invited_email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.invited_email}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.status === "pending" ? (
                        <span className="flex items-center gap-1 text-xs text-yellow-600">
                          <Clock className="w-3 h-3" /> Convite pendente
                        </span>
                      ) : m.status === "active" ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <Check className="w-3 h-3" /> Ativo desde {new Date(m.accepted_at!).toLocaleDateString("pt-BR")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Acesso revogado</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={m.role}
                      onChange={(e) => updateRoleMutation.mutate({ id: m.id, newRole: e.target.value })}
                      disabled={m.status === "revoked"}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    {m.status !== "revoked" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => revokeMutation.mutate(m.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Permissions table */}
      <div className="bg-card border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-sm">Tabela de permissões</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left px-5 py-3 text-muted-foreground font-medium">Funcionalidade</th>
                <th className="px-4 py-3 text-center text-purple-700">Admin</th>
                <th className="px-4 py-3 text-center text-blue-700">Operador</th>
                <th className="px-4 py-3 text-center text-muted-foreground">Visualizador</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                ["Enviar campanhas", true, true, false],
                ["Gerenciar contatos", true, true, false],
                ["Responder conversas", true, true, false],
                ["Ver analytics", true, true, true],
                ["Gerenciar automações", true, false, false],
                ["Configurações da conta", true, false, false],
                ["Faturamento e planos", false, false, false],
              ].map(([label, admin, op, viewer]) => (
                <tr key={label as string}>
                  <td className="px-5 py-2.5 text-muted-foreground">{label as string}</td>
                  {[admin, op, viewer].map((v, i) => (
                    <td key={i} className="px-4 py-2.5 text-center">
                      {v
                        ? <Check className="w-3.5 h-3.5 text-green-600 mx-auto" />
                        : <span className="text-muted-foreground/40">—</span>
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
