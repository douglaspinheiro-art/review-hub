import { useMemo, useState } from "react";
import { Search, MessageCircle, Mail, Phone, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useContacts } from "@/hooks/useDashboard";
import { useNavigate, useSearchParams } from "react-router-dom";
import { contactMatchesEnglishRfmSegment, isValidRfmQuerySegment } from "@/lib/rfm-segments";

export default function Contatos() {
  const [search, setSearch] = useState("");
  const [searchParams] = useSearchParams();
  const rfmParam = searchParams.get("rfm");
  const { data: contactsResult, isLoading } = useContacts();
  const contacts = contactsResult?.contacts ?? [];
  const totalCount = contactsResult?.totalCount ?? 0;
  const isTruncated = totalCount > contacts.length;
  const navigate = useNavigate();

  const filtered = useMemo(() => {
    let list = contacts as any[];
    if (rfmParam && isValidRfmQuerySegment(rfmParam)) {
      list = list.filter((c: any) => contactMatchesEnglishRfmSegment(c.rfm_segment, rfmParam));
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c: any) =>
      String(c.name ?? "").toLowerCase().includes(q) ||
      String(c.email ?? "").toLowerCase().includes(q) ||
      String(c.phone ?? "").includes(q)
    );
  }, [contacts, search, rfmParam]);

  const rfmCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contacts as any[]) {
      const seg = String(c.rfm_segment ?? "sem_segmento");
      map[seg] = (map[seg] ?? 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [contacts]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground">Base real de clientes sincronizada.</p>
          {rfmParam && isValidRfmQuerySegment(rfmParam) && (
            <p className="text-xs text-muted-foreground mt-1">
              Filtrando por segmento RFM: <span className="font-medium text-foreground">{rfmParam.replaceAll("_", " ")}</span>
              {" "}
              <button type="button" className="text-primary underline" onClick={() => navigate("/dashboard/contatos")}>
                limpar
              </button>
            </p>
          )}
          {isTruncated && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Exibindo {contacts.length} contatos mais recentes de {totalCount} no total.
            </p>
          )}
        </div>
        <Badge variant="outline" className="text-xs">{totalCount || contacts.length} contatos</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {rfmCounts.map(([seg, count]) => (
          <div key={seg} className="border rounded-lg p-3 bg-card">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{seg.replaceAll("_", " ")}</p>
            <p className="text-lg font-semibold">{count}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-xl">
        <div className="p-4 border-b">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Nome, email ou telefone..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="divide-y">
          {isLoading && (
            <div className="p-6 text-sm text-muted-foreground">Carregando contatos...</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum contato encontrado.</div>
          )}
          {!isLoading && filtered.map((c: any) => (
            <div key={c.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold truncate">{c.name || "Sem nome"}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  {c.email && <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                  {c.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                </div>
                <div className="mt-1">
                  <Badge variant="outline" className="text-[10px]">{c.rfm_segment ?? "sem_segmento"}</Badge>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => navigate("/dashboard/inbox")}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Inbox
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
