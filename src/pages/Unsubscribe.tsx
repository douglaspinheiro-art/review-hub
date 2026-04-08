import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const userId = params.get("user");
  const contactId = params.get("contact");
  const ts = params.get("ts");
  const sig = params.get("sig");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!userId || !contactId || !ts || !sig) {
      setStatus("error");
      return;
    }

    supabase.functions
      .invoke("unsubscribe-contact", { body: { user_id: userId, contact_id: contactId, ts, sig } })
      .then(({ error }) => {
        setStatus(error ? "error" : "success");
      })
      .catch(() => setStatus("error"));
  }, [userId, contactId, ts, sig]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="bg-background border rounded-2xl shadow-lg p-8 max-w-sm w-full text-center space-y-4">
        {status === "loading" && (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">Processando sua solicitação...</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h1 className="font-black text-lg">Inscrição cancelada</h1>
            <p className="text-sm text-muted-foreground">
              Você não receberá mais e-mails desta loja. Se isso foi um engano, entre em contato
              diretamente com o remetente.
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="w-10 h-10 text-destructive mx-auto" />
            <h1 className="font-black text-lg">Link inválido</h1>
            <p className="text-sm text-muted-foreground">
              Este link de cancelamento é inválido ou já expirou.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
