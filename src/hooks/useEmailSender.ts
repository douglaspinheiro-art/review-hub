import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface EmailPayload {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

export function useEmailSender() {
  const sendEmail = async (payload: EmailPayload) => {
    try {
      const { data, error } = await supabase.functions.invoke("send-email", {
        body: payload,
      });

      if (error) throw error;

      return { success: true, data };
    } catch (e: any) {
      console.error("Erro ao enviar e-mail:", e);
      toast.error("Falha ao enviar e-mail. Verifique sua integração com Resend.");
      return { success: false, error: e.message };
    }
  };

  return { sendEmail };
}
