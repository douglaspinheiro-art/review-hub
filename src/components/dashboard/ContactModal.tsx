import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  phone: z.string().min(8, "Telefone obrigatório"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  onClose: () => void;
}

export default function ContactModal({ onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const phone = data.phone.replace(/\D/g, "");
      const normalizedPhone = phone.startsWith("55") ? phone : `55${phone}`;
      const tags = data.tags
        ? data.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const { error } = await supabase.from("contacts").insert({
        user_id: user!.id,
        name: data.name,
        phone: normalizedPhone,
        email: data.email || null,
        tags,
        notes: data.notes || null,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      toast({ title: "Contato adicionado!" });
      onClose();
    },
    onError: (err: Error) => {
      toast({
        title: "Erro ao adicionar contato",
        description: err.message.includes("unique") ? "Esse telefone já está cadastrado." : err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold">Novo Contato</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="name">Nome *</Label>
                <Input id="name" placeholder="João Silva" {...register("name")} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone / WhatsApp *</Label>
                <Input id="phone" placeholder="11 99999-9999" {...register("phone")} />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" placeholder="joao@email.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="tags">Tags</Label>
                <Input id="tags" placeholder="vip, fidelizado, novo (separadas por vírgula)" {...register("tags")} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="notes">Notas</Label>
                <Input id="notes" placeholder="Observações sobre o contato..." {...register("notes")} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t">
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Adicionar contato
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
