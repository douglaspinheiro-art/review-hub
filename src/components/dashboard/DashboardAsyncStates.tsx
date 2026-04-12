import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function DashboardListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function DashboardErrorCard({
  title,
  message,
  onRetry,
  className,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Card className={cn("p-6 border-destructive/30 bg-destructive/5", className)} role="alert">
      <div className="flex gap-3">
        <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden />
        <div className="space-y-3 min-w-0">
          {title ? <p className="text-sm font-semibold text-destructive">{title}</p> : null}
          <p className="text-sm text-destructive">{message}</p>
          {onRetry ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
              Tentar novamente
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function DashboardEmptyCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-8 border-dashed", className)}>
      <h2 className="text-lg font-semibold mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{description}</p>
      {children}
    </Card>
  );
}
