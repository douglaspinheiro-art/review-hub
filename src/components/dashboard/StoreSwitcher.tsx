import { Store } from "lucide-react";
import { useStoreScopeOptional } from "@/contexts/StoreScopeContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function StoreSwitcher() {
  const scope = useStoreScopeOptional();
  if (!scope || scope.storeOptions.length <= 1 || !scope.activeStoreId) return null;

  return (
    <div className="flex items-center gap-2 mr-2">
      <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
      <Select value={scope.activeStoreId} onValueChange={scope.setActiveStoreId}>
        <SelectTrigger className="h-9 w-[min(220px,42vw)] text-xs font-bold rounded-xl border-border/60 bg-background/80">
          <SelectValue placeholder="Loja" />
        </SelectTrigger>
        <SelectContent>
          {scope.storeOptions.map((s) => (
            <SelectItem key={s.id} value={s.id} className="text-xs font-medium">
              {s.name?.trim() || "Loja sem nome"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
