import { Component, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/error-monitoring";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? "Erro desconhecido" };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    void reportClientError({
      message: error?.message ?? "Unknown client error",
      stack: error?.stack,
      componentStack: info.componentStack,
      route: typeof window !== "undefined" ? window.location.pathname : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-destructive" />
        </div>
        <div className="space-y-1 max-w-sm">
          <h2 className="text-lg font-semibold">Algo deu errado</h2>
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro inesperado. Tente recarregar a página ou entre em contato com o suporte se o problema persistir.
          </p>
          {this.state.message && (
            <p className="text-xs font-mono text-muted-foreground/70 mt-2 bg-muted rounded px-2 py-1">
              {this.state.message}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={this.handleReset} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Tentar novamente
          </Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            Voltar ao início
          </Button>
        </div>
      </div>
    );
  }
}
