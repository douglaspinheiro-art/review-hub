import { Navigate } from "react-router-dom";

/**
 * Rota legada: configuração do agente vive em `/dashboard/agente-ia`.
 */
export default function Chatbot() {
  return <Navigate to="/dashboard/agente-ia" replace />;
}
