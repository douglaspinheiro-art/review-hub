import { Navigate } from "react-router-dom";
import { useDemo } from "@/contexts/DemoContext";

/**
 * Rota legada: configuração do agente vive em `/dashboard/agente-ia`.
 */
export default function Chatbot() {
  const { isDemo } = useDemo();
  return <Navigate to={isDemo ? "/demo" : "/dashboard/agente-ia"} replace />;
}
