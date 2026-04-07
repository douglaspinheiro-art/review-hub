import React, { useState } from "react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";

interface TrialGateProps {
  children: React.ReactElement;
  action?: string;
}

export function TrialGate({ children, action = "esta ação" }: TrialGateProps) {
  const { isTrialActive } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (!isTrialActive) return children;

  const gated = React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    },
  });

  return (
    <>
      {gated}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <DialogTitle className="text-center font-black text-xl">
              Ative seu plano para continuar
            </DialogTitle>
            <DialogDescription className="text-center">
              Seu acesso de demonstração permite <strong>visualizar</strong> todas as
              funcionalidades, mas para {action} você precisa de um plano ativo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-2">
            <Button
              className="font-black rounded-xl"
              onClick={() => { setOpen(false); navigate("/upgrade"); }}
            >
              Ver planos e ativar agora
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} className="text-muted-foreground">
              Continuar explorando
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
