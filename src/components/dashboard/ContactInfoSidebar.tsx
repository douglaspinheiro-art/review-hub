import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShoppingBag, DollarSign, Calendar, Tag, User, Phone, Mail, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
  total_orders?: number;
  total_spent?: number;
  created_at?: string;
  notes?: string;
}

interface ContactInfoSidebarProps {
  contact: Contact | null;
  className?: string;
}

export function ContactInfoSidebar({ contact, className }: ContactInfoSidebarProps) {
  if (!contact) return null;

  const initials = contact.name?.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";

  return (
    <aside className={cn("flex flex-col h-full bg-card border-l w-80 overflow-y-auto", className)}>
      <div className="p-6 flex flex-col items-center text-center">
        <Avatar className="w-20 h-20 mb-4 border-2 border-primary/10">
          <AvatarFallback className="text-xl font-bold bg-primary/5 text-primary">
            {initials}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-semibold text-lg leading-tight">{contact.name || contact.phone}</h3>
        <p className="text-sm text-muted-foreground mt-1">{contact.phone}</p>
        
        <div className="flex flex-wrap justify-center gap-1.5 mt-4">
          {contact.tags?.map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] px-2 py-0 capitalize">
              {tag}
            </Badge>
          ))}
          {(!contact.tags || contact.tags.length === 0) && (
            <span className="text-[10px] text-muted-foreground italic">Sem tags</span>
          )}
        </div>
      </div>

      <Separator />

      <div className="p-6 space-y-6">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Métricas de Valor</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span className="text-[10px] font-medium uppercase">Pedidos</span>
              </div>
              <p className="text-lg font-bold">{contact.total_orders || 0}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <DollarSign className="w-3.5 h-3.5" />
                <span className="text-[10px] font-medium uppercase">Total Gasto</span>
              </div>
              <p className="text-lg font-bold">
                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contact.total_spent || 0)}
              </p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Informações</h4>
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Mail className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">Email</p>
                <p className="truncate">{contact.email || "Não informado"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-muted-foreground uppercase">Cliente desde</p>
                <p>{contact.created_at ? new Date(contact.created_at).toLocaleDateString('pt-BR') : "—"}</p>
              </div>
            </div>
          </div>
        </div>

        {contact.notes && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Notas</h4>
            <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg border border-dashed italic">
              "{contact.notes}"
            </p>
          </div>
        )}

        <button className="w-full flex items-center justify-between p-3 rounded-xl border hover:bg-muted/50 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <span className="text-sm font-medium">Ver perfil completo</span>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </aside>
  );
}
