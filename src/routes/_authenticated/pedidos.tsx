import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Link as LinkIcon,
  FileSpreadsheet,
  ClipboardPaste,
  FileDown,
  LogOut,
  RefreshCw,
  Search,
  MessageCircle,
  Users,
  ShoppingBag,
  UserX,
  TrendingUp,
  Package,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  Plus,
  Sparkles,
  Trash2,
  IdCard,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { BRANDS, type BrandId } from "@/lib/catalog";
import { checkAdmin } from "@/lib/catalog.functions";
import {
  listQuotes,
  setQuoteStatus,
  deleteQuote,
  sourceLabel,
  type QuoteRecord,
} from "@/lib/quotes.functions";
import { ManualOrderDialog } from "@/components/ManualOrderDialog";
import { ImportOrderDialog } from "@/components/ImportOrderDialog";
import { UpdateTableDialog } from "@/components/UpdateTableDialog";
import { CustomerProfileDialog } from "@/components/CustomerProfileDialog";
import { customerKey, quoteKey } from "@/lib/customer-profile";
import { getCatalog } from "@/lib/catalog.functions";
import { applyCatalog } from "@/lib/catalog";
import { listLeadsForReactivation, type ReactivationLead } from "@/lib/leads.functions";
import { buildOrderSheet, downloadBlob, orderSheetFileName } from "@/lib/order-sheet";
import { buildPasteSheet, pasteSheetFileName, pasteInstruction } from "@/lib/paste-sheet";
import { preencherTalaoBelliz, talaoFileName, TalaoInvalido } from "@/lib/belliz-talao";
import { guardarTalao, lerTalao, type TalaoGuardado } from "@/lib/talao-store";
import { buildQuotePdf, downloadPdf, quoteFileName, type QuoteLine } from "@/lib/quote-pdf";
import { conferirPrecos, resumoChecagem } from "@/lib/conferencia-preco";
import { buildLeadsSheet, leadsSheetFileName } from "@/lib/leads-sheet";
import { formatCnpj, formatPhone, onlyDigits } from "@/lib/leads";
import { useModeloPayot } from "@/lib/use-modelo-payot";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pedidos")({
  loader: async () => {
    const { rows } = await getCatalog();
    applyCatalog(rows);
    return null;
  },
  head: () => ({
    meta: [
      { title: "Gestão de Pedidos & Clientes — Rede Representações" },
      {
        name: "description",
        content:
          "Painel administrativo para acompanhamento de orçamentos por marca e reativação de clientes cadastrados.",
      },
      { property: "og:title", content: "Gestão de Pedidos & Clientes — Rede Representações" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuotesAndLeadsPage,
});

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS = ["novo", "enviado", "faturado", "cancelado"] as const;

function QuotesAndLeadsPage() {
  const navigate = useNavigate();
  const check = useServerFn(checkAdmin);
  const listQuotesFn = useServerFn(listQuotes);
  const setStatusFn = useServerFn(setQuoteStatus);
  const listLeadsFn = useServerFn(listLeadsForReactivation);

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<"quotes" | "reactivation">("quotes");

  // Dados de Orçamentos
  const [quotes, setQuotes] = useState<QuoteRecord[]>([]);
  const [quoteSearch, setQuoteSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<"todas" | "belliz" | "payot">("todas");
  const [statusFilter, setStatusFilter] = useState<string>("todos");

  // Dados de Leads & Reativação
  const [leads, setLeads] = useState<ReactivationLead[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const [leadStatusFilter, setLeadStatusFilter] = useState<"todos" | "sem_pedido" | "com_pedido">("todos");

  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tabelaOpen, setTabelaOpen] = useState(false);
  // Traz o mapa da tabela da Payot do banco assim que o painel abre, para a
  // colagem sair alinhada mesmo em um aparelho que nunca importou a tabela.
  const { status: statusModelo, publicar: publicarModelo } = useModeloPayot();
  // Ficha do cliente: guarda a chave (CNPJ ou telefone) de quem está aberto
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const deleteQuoteFn = useServerFn(deleteQuote);

  const removeQuote = async (q: QuoteRecord) => {
    const quem = q.customer_name?.trim() || "sem cliente";
    if (!window.confirm(`Excluir este orçamento de ${quem}? A ação não pode ser desfeita.`))
      return;
    try {
      await deleteQuoteFn({ data: { id: q.id } });
      setQuotes((prev) => prev.filter((x) => x.id !== q.id));
      toast.success("Orçamento excluído.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir.");
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [quotesRes, leadsRes] = await Promise.all([
        listQuotesFn({ data: { limit: 150 } }),
        listLeadsFn(),
      ]);
      setQuotes(quotesRes.rows);
      setLeads(leadsRes.leads);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    check()
      .then((r) => {
        setIsAdmin(r.isAdmin);
        if (r.isAdmin) void loadData();
      })
      .catch(() => setIsAdmin(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtro de Orçamentos
  const filteredQuotes = useMemo(() => {
    const q = quoteSearch.trim().toLowerCase();
    return quotes.filter((item) => {
      if (brandFilter !== "todas" && item.brand_id !== brandFilter) return false;
      if (statusFilter !== "todos" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.customer_name.toLowerCase().includes(q) ||
        item.customer_phone.includes(q) ||
        item.customer_cnpj.includes(q)
      );
    });
  }, [quotes, quoteSearch, brandFilter, statusFilter]);

  // Filtro de Leads para Reativação
  const filteredLeads = useMemo(() => {
    const q = leadSearch.trim().toLowerCase();
    return leads.filter((lead) => {
      if (leadStatusFilter === "sem_pedido" && lead.has_ordered) return false;
      if (leadStatusFilter === "com_pedido" && !lead.has_ordered) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.phone.includes(q) ||
        lead.cnpj.includes(q)
      );
    });
  }, [leads, leadSearch, leadStatusFilter]);

  // Métricas do Dashboard de Reativação
  const stats = useMemo(() => {
    const totalLeads = leads.length;
    const orderedLeads = leads.filter((l) => l.has_ordered).length;
    const pendingLeads = leads.filter((l) => !l.has_ordered).length;
    const totalValue = quotes.reduce((acc, q) => acc + Number(q.total || 0), 0);
    const conversionRate = totalLeads > 0 ? Math.round((orderedLeads / totalLeads) * 100) : 0;

    return {
      totalLeads,
      orderedLeads,
      pendingLeads,
      totalValue,
      conversionRate,
    };
  }, [leads, quotes]);

  if (isAdmin === null) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-10 text-sm text-muted-foreground">
        <RefreshCw className="mr-2 size-5 animate-spin text-primary" /> Carregando painel…
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <div className="grid size-12 mx-auto place-items-center rounded-full bg-destructive/10 text-destructive mb-4">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta conta não possui permissão de administrador.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          Sair da conta
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {/* Header do Painel */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          {/* Este painel é a página inicial do representante: o catálogo é um
              destino, não um "voltar" */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
          >
            Ver o catálogo público <ArrowRight className="size-3.5" />
          </Link>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            Painel do Representante
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Gestão de pedidos por marca e reativação comercial de clientes cadastrados.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin">
            <Button variant="outline" size="sm">
              Base de Preços
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Atualizar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="size-3.5" /> Sair
          </Button>
        </div>
      </div>

      {/* Tabs Principais: Orçamentos vs Reativação de Clientes */}
      <div className="mt-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "quotes" | "reactivation")}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2 max-w-md mb-6">
            <TabsTrigger value="quotes" className="gap-2 font-bold text-xs sm:text-sm">
              <ShoppingBag className="size-4" /> Orçamentos por Marca
              <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary">
                {quotes.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="reactivation" className="gap-2 font-bold text-xs sm:text-sm">
              <Users className="size-4" /> Reativação de Clientes
              {stats.pendingLeads > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                  {stats.pendingLeads} pendentes
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ======================================================== */}
          {/* ABA 1: ORÇAMENTOS POR MARCA                              */}
          {/* ======================================================== */}
          <TabsContent value="quotes" className="space-y-6 focus-visible:outline-none">
            {/* Filtros de Orçamentos */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={quoteSearch}
                    onChange={(e) => setQuoteSearch(e.target.value)}
                    placeholder="Buscar por cliente, CNPJ ou WhatsApp…"
                    className="pl-9"
                  />
                </div>

                {/* Filtro por Marca */}
                <div className="flex items-center gap-1">
                  {(["todas", "belliz", "payot"] as const).map((b) => (
                    <Button
                      key={b}
                      variant={brandFilter === b ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBrandFilter(b)}
                      className="text-xs capitalize"
                    >
                      {b === "todas" ? "Todas as Marcas" : BRANDS[b].name}
                    </Button>
                  ))}
                </div>

                {/* Filtro por Status */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2.5 text-xs font-medium"
                >
                  <option value="todos">Todos os Status</option>
                  {STATUS.map((s) => (
                    <option key={s} value={s}>
                      Status: {s}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-right text-xs text-muted-foreground">
                  <strong>{filteredQuotes.length}</strong> orçamentos encontrados
                </span>
                {/* Lança pedido que chegou por WhatsApp, foto ou e-mail */}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs font-bold"
                  onClick={() => setManualOpen(true)}
                >
                  <Plus className="size-4" /> Lançar à mão
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 text-xs font-bold"
                  onClick={() => setImportOpen(true)}
                >
                  <Sparkles className="size-4" /> Importar pedido
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-xs font-bold"
                  onClick={() => setTabelaOpen(true)}
                  title="Importar a tabela de precos do mes da Payot"
                >
                  <RefreshCw className="size-4" /> Atualizar tabela
                </Button>
              </div>
            </div>

            {/* Lista de Cards de Orçamento */}
            <div className="space-y-3">
              {filteredQuotes.map((q) => (
                <QuoteCard
                  onDelete={() => removeQuote(q)}
                  onOpenProfile={() => setProfileKey(quoteKey(q))}
                  key={q.id}
                  quote={q}
                  onStatus={async (status) => {
                    try {
                      await setStatusFn({ data: { id: q.id, status } });
                      setQuotes((prev) =>
                        prev.map((r) => (r.id === q.id ? { ...r, status } : r))
                      );
                      toast.success(`Situação atualizada para '${status}'`);
                    } catch (err) {
                      toast.error(
                        err instanceof Error ? err.message : "Não foi possível atualizar."
                      );
                    }
                  }}
                />
              ))}

              {!loading && filteredQuotes.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  Nenhum orçamento encontrado com os filtros selecionados.
                </div>
              )}
            </div>
          </TabsContent>

          {/* ======================================================== */}
          {/* ABA 2: REATIVAÇÃO DE CLIENTES / LEADS SEM PEDIDO         */}
          {/* ======================================================== */}
          <TabsContent value="reactivation" className="space-y-6 focus-visible:outline-none">
            {/* Dashboard Cards com Métricas */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Lojistas Cadastrados</span>
                  <Users className="size-4 text-primary" />
                </div>
                <p className="mt-2 text-2xl font-black">{stats.totalLeads}</p>
                <p className="text-[11px] text-muted-foreground">Base total de leads</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Pedidos Feitos</span>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-black text-emerald-600">
                  {stats.orderedLeads}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {stats.conversionRate}% taxa de conversão
                </p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-center justify-between text-amber-700">
                  <span className="text-xs font-bold">Sem Pedido (Reativar)</span>
                  <UserX className="size-4 text-amber-600" />
                </div>
                <p className="mt-2 text-2xl font-black text-amber-600">
                  {stats.pendingLeads}
                </p>
                <p className="text-[11px] text-amber-700">Lojistas com desconto aguardando</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Volume em Orçamentos</span>
                  <TrendingUp className="size-4 text-primary" />
                </div>
                <p className="mt-2 text-2xl font-black text-primary">
                  {brl(stats.totalValue)}
                </p>
                <p className="text-[11px] text-muted-foreground">Total gerado no catálogo</p>
              </div>
            </div>

            {/* Barra de Filtros de Reativação */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-1 flex-wrap items-center gap-2 min-w-[280px]">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Buscar por nome da loja, CNPJ ou WhatsApp…"
                    className="pl-9"
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant={leadStatusFilter === "todos" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLeadStatusFilter("todos")}
                    className="text-xs"
                  >
                    Todos ({leads.length})
                  </Button>
                  <Button
                    variant={leadStatusFilter === "sem_pedido" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLeadStatusFilter("sem_pedido")}
                    className="text-xs gap-1 border-amber-500/40 text-amber-700 hover:bg-amber-50"
                  >
                    ⚠️ Sem Pedido ({stats.pendingLeads})
                  </Button>
                  <Button
                    variant={leadStatusFilter === "com_pedido" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLeadStatusFilter("com_pedido")}
                    className="text-xs gap-1 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50"
                  >
                    ✅ Com Pedido ({stats.orderedLeads})
                  </Button>
                </div>
              </div>

              {/* Exporta a base de leads (respeita a busca e o filtro ativos) */}
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs font-semibold"
                disabled={filteredLeads.length === 0}
                onClick={() => {
                  downloadBlob(buildLeadsSheet(filteredLeads), leadsSheetFileName());
                  toast.success(
                    `Planilha com ${filteredLeads.length} lead(s) baixada.`,
                  );
                }}
              >
                <FileSpreadsheet className="size-4" /> Baixar planilha de leads (
                {filteredLeads.length})
              </Button>
            </div>

            {/* Lista de Clientes para Reativação */}
            <div className="space-y-3">
              {filteredLeads.map((lead) => (
                <ReactivationCard
                  key={lead.id}
                  lead={lead}
                  onOpenProfile={() => setProfileKey(customerKey(lead))}
                />
              ))}

              {!loading && filteredLeads.length === 0 && (
                <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  Nenhum cliente encontrado para este filtro.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ManualOrderDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onCreated={() => void loadData()}
      />

      <ImportOrderDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onCreated={() => void loadData()}
      />

      <UpdateTableDialog
        open={tabelaOpen}
        onOpenChange={setTabelaOpen}
        onApplied={() => void loadData()}
        publicarModelo={publicarModelo}
        statusModelo={statusModelo}
      />

      <CustomerProfileDialog
        customerKey={profileKey}
        onOpenChange={(open) => !open && setProfileKey(null)}
        leads={leads}
        quotes={quotes}
      />
    </main>
  );
}

/* ---------------- Card de Orçamento ---------------- */

function QuoteCard({
  quote,
  onStatus,
  onDelete,
  onOpenProfile,
}: {
  quote: QuoteRecord;
  onStatus: (status: (typeof STATUS)[number]) => Promise<void>;
  onDelete: () => void;
  onOpenProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const brand = quote.brand_id as BrandId;
  const brandName = BRANDS[brand]?.name ?? quote.brand_id;

  const download = () => {
    const meta = {
      brandId: brand as "belliz" | "payot",
      brandName,
      customerName: quote.customer_name,
      customerPhone: quote.customer_phone,
      customerCnpj: quote.customer_cnpj,
      createdAt: quote.created_at,
    };
    downloadBlob(buildOrderSheet(quote.items, meta), orderSheetFileName(meta));
  };

  /** Versão pronta para colar no modelo oficial da indústria. */
  // Talão oficial da Belliz preenchido: escreve código e quantidade dentro do
  // arquivo original, sem tocar nas macros nem nas abas escondidas dele.
  const talaoRef = useRef<HTMLInputElement | null>(null);
  const [talao, setTalao] = useState<TalaoGuardado | null>(null);
  const [gerandoTalao, setGerandoTalao] = useState(false);

  useEffect(() => {
    if (brand !== "belliz") return;
    void lerTalao().then(setTalao);
  }, [brand]);

  const gerarTalao = async (guardado: TalaoGuardado) => {
    setGerandoTalao(true);
    try {
      const res = preencherTalaoBelliz(guardado.arquivo.slice(0), quote.items);
      downloadBlob(res.blob, talaoFileName(quote.customer_name, quote.created_at));
      toast.success(`Talão preenchido com ${res.lancados} itens.`, {
        description:
          "É o talão oficial da Belliz. Abra no Excel, habilite as macros e confira a UF antes de enviar.",
      });
    } catch (err) {
      toast.error(
        err instanceof TalaoInvalido ? err.message : "Não consegui preencher o talão.",
      );
    } finally {
      setGerandoTalao(false);
    }
  };

  const escolherTalao = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.xlsm$/i.test(f.name)) {
      toast.error("Escolha o Talão de Pedidos da Belliz (.xlsm).");
      return;
    }
    try {
      const guardado = await guardarTalao(f);
      setTalao(guardado);
      await gerarTalao(guardado);
    } catch {
      toast.error("Não consegui guardar o talão neste navegador.");
    }
  };

  const downloadColar = () => {
    const meta = {
      brandId: brand as "belliz" | "payot",
      brandName,
      customerName: quote.customer_name,
      customerPhone: quote.customer_phone,
      customerCnpj: quote.customer_cnpj,
      createdAt: quote.created_at,
    };
    downloadBlob(buildPasteSheet(quote.items, meta), pasteSheetFileName(meta));
    toast.success("Arquivo de colagem baixado.", {
      description: pasteInstruction(meta.brandId),
    });
  };

  /** Orçamento enxuto para mandar ao cliente: código, item, quantidade e valor. */
  const downloadPdfOrcamento = () => {
    const linhas: QuoteLine[] = quote.items.map((i) => ({
      brand: brandName,
      code: i.code,
      name: i.name,
      line: i.line ?? "",
      pack: i.pack,
      qty: i.qty,
      unitPrice: i.unitPrice,
    }));
    downloadPdf(
      buildQuotePdf(linhas, {
        title: `Orçamento ${brandName}`,
        customerName: quote.customer_name || "Cliente",
        customerPhone: quote.customer_phone,
        customerCnpj: quote.customer_cnpj,
      }),
      quoteFileName({ title: "", customerName: quote.customer_name || "cliente" }),
    );
    const c = conferirPrecos(quote.items, brand);
    if (!c.ok) toast.warning("Confira os preços deste orçamento.", { description: resumoChecagem(c) });
  };

  const cleanPhone = onlyDigits(quote.customer_phone);
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(
    `Olá, ${quote.customer_name}! Tudo bem? Recebemos o seu orçamento de ${brandName} no valor de ${brl(
      Number(quote.total)
    )}. Gostaria de confirmar o faturamento e as condições de entrega?`
  )}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider",
                brand === "belliz"
                  ? "bg-rose-500/10 text-rose-600"
                  : "bg-amber-500/10 text-amber-700"
              )}
            >
              {brandName}
            </span>
            <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
              {sourceLabel(quote.source)}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(quote.created_at).toLocaleString("pt-BR")}
            </span>
          </div>

          <h3 className="mt-1 text-base font-bold">{quote.customer_name}</h3>
          <p className="text-xs text-muted-foreground">
            CNPJ: <strong className="font-mono text-foreground">{formatCnpj(quote.customer_cnpj)}</strong> · WhatsApp:{" "}
            <strong className="text-foreground">{formatPhone(quote.customer_phone)}</strong>
          </p>

          <p className="mt-2 text-sm font-medium">
            {quote.items_count} produtos · {quote.units_count} unidades · Total estimado:{" "}
            <strong className="text-base font-bold text-primary">{brl(Number(quote.total))}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Situação */}
          <select
            value={quote.status}
            onChange={(e) => void onStatus(e.target.value as (typeof STATUS)[number])}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-xs font-semibold"
          >
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s.toUpperCase()}
              </option>
            ))}
          </select>

          {/* Botão de Download de Planilha Padrão da Marca */}
          <Button size="sm" onClick={download} className="gap-1.5">
            <FileSpreadsheet className="size-4" /> Planilha {brandName}
          </Button>

          {/* Colunas alinhadas com o modelo oficial da industria */}
          <Button
            size="sm"
            variant="outline"
            onClick={downloadColar}
            className="gap-1.5 text-xs"
            title={pasteInstruction(brand as "belliz" | "payot")}
          >
            <ClipboardPaste className="size-4" /> Colar no modelo
          </Button>

          {/* Talao oficial da Belliz, ja preenchido */}
          {brand === "belliz" && (
            <>
              <input
                ref={talaoRef}
                type="file"
                accept=".xlsm"
                className="hidden"
                onChange={(e) => void escolherTalao(e.target.files?.[0])}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={gerandoTalao}
                className="gap-1.5 text-xs"
                title={
                  talao
                    ? `Preenche o ${talao.nome} guardado neste navegador.`
                    : "Escolha o Talão de Pedidos da Belliz uma vez; depois é só clicar."
                }
                onClick={() => {
                  if (talao) void gerarTalao(talao);
                  else talaoRef.current?.click();
                }}
              >
                <FileSpreadsheet className="size-4" />
                {gerandoTalao ? "Preenchendo…" : talao ? "Talão preenchido" : "Talão: escolher modelo"}
              </Button>
            </>
          )}

          {/* Versao enxuta para mandar ao cliente */}
          <Button
            size="sm"
            variant="outline"
            onClick={downloadPdfOrcamento}
            className="gap-1.5 text-xs"
          >
            <FileDown className="size-4" /> PDF do cliente
          </Button>

          {/* Abre a ficha consolidada do cliente */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenProfile}
            className="gap-1.5 text-xs"
          >
            <IdCard className="size-4" /> Ficha
          </Button>

          {/* Orçamento não é pedido fechado: pode ser descartado */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title="Excluir orçamento"
            className="size-9 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>

          {/* Abertura do WhatsApp do Cliente */}
          {cleanPhone.length >= 10 && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5 border-emerald-500/40 text-emerald-700 hover:bg-emerald-50">
                <MessageCircle className="size-4" /> WhatsApp
              </Button>
            </a>
          )}

          {/* Ver Detalhamento dos Itens */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setOpen((v) => !v)}
            className="gap-1 text-xs"
          >
            {open ? (
              <>
                <ChevronUp className="size-3.5" /> Ocultar
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" /> Itens ({quote.items.length})
              </>
            )}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
          <div className="grid grid-cols-12 font-bold text-muted-foreground pb-2 border-b border-border/60">
            <span className="col-span-2">Código</span>
            <span className="col-span-5">Produto</span>
            <span className="col-span-2 text-center">Qtd</span>
            <span className="col-span-3 text-right">Preço Unit. / Total</span>
          </div>
          {quote.items.map((i, idx) => (
            <div
              key={`${i.code}-${idx}`}
              className="grid grid-cols-12 items-center py-2 border-b border-border/30 last:border-0"
            >
              <span className="col-span-2 font-mono text-muted-foreground">#{i.code}</span>
              <span className="col-span-5 font-medium leading-tight">
                {i.name}
                {i.pack > 1 && (
                  <span className="text-[10px] text-muted-foreground block">
                    (coletivo com {i.pack} un)
                  </span>
                )}
              </span>
              <span className="col-span-2 text-center font-bold">{i.qty} un</span>
              <span className="col-span-3 text-right">
                <span className="text-muted-foreground">{brl(i.unitPrice)} un</span>
                <span className="block font-bold text-primary">{brl(i.qty * i.unitPrice)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Card de Reativação de Cliente ---------------- */

function ReactivationCard({
  lead,
  onOpenProfile,
}: {
  lead: ReactivationLead;
  onOpenProfile: () => void;
}) {
  const cleanPhone = onlyDigits(lead.phone);
  const firstName = lead.name.split(" ")[0];

  // Mensagem personalizada de reativação
  const message = lead.has_ordered
    ? `Olá, *${firstName}*! Tudo bem? Aqui é da *Rede Representações*.\n\nPassando para saber como estão as vendas dos produtos na sua loja (*${lead.name}*) e se precisa de reposição de estoque para as marcas *Belliz* e *Payot*. Estamos com ótimas condições de entrega!`
    : `Olá, *${firstName}*! Tudo bem? Aqui é da *Rede Representações*.\n\nVimos que você se cadastrou no nosso Catálogo Digital para a loja *${lead.name}* e desbloqueou seu cupom de *15% de desconto* de boas-vindas.\n\nVocê gostaria de tirar alguma dúvida sobre os produtos das marcas *Belliz* ou *Payot*? Posso te ajudar a montar o mix ideal para o giro da sua loja!`;

  // Link pessoal: o cliente abre e entra reconhecido, sem tela de cadastro.
  // Quem só apareceu em pedidos antigos ainda não tem token.
  const linkPessoal = lead.access_token
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/?c=${lead.access_token}`
    : "";
  const mensagemCompleta = linkPessoal
    ? `${message}

Seu catálogo, já com seu desconto aplicado: ${linkPessoal}`
    : message;

  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(mensagemCompleta)}`;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all bg-card",
        !lead.has_ordered
          ? "border-amber-500/40 bg-gradient-to-r from-amber-500/5 via-card to-card hover:border-amber-500/70"
          : "border-border hover:border-primary/40"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {!lead.has_ordered ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                <AlertCircle className="size-3" /> Sem Pedido · Oportunidade de Reativação
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                <CheckCircle2 className="size-3" /> Cliente Ativo ({lead.quotes_count} pedidos)
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              Cadastrado em {new Date(lead.created_at).toLocaleDateString("pt-BR")}
            </span>
          </div>

          <h3 className="mt-1 text-base font-bold text-foreground">{lead.name}</h3>
          <p className="text-xs text-muted-foreground">
            CNPJ: <strong className="font-mono text-foreground">{formatCnpj(lead.cnpj)}</strong> · WhatsApp:{" "}
            <strong className="text-foreground">{formatPhone(lead.phone)}</strong>
            {lead.city && (
              <>
                {" · "}
                <strong className="text-foreground">
                  {lead.city}/{lead.state || "BA"}
                </strong>
              </>
            )}
          </p>

          {lead.has_ordered && (
            <p className="mt-1 text-xs text-muted-foreground">
              Volume total orçado: <strong className="text-primary font-bold">{brl(lead.quotes_total)}</strong>
              {lead.last_quote_at && ` · Último pedido em ${new Date(lead.last_quote_at).toLocaleDateString("pt-BR")}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {cleanPhone.length >= 10 ? (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Button
                size="sm"
                className={cn(
                  "gap-2 font-bold shadow-sm",
                  !lead.has_ordered
                    ? "bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white"
                )}
              >
                <MessageCircle className="size-4" />
                {!lead.has_ordered ? "Reativar no WhatsApp" : "Enviar Mensagem"}
              </Button>
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">Telefone inválido</span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={onOpenProfile}
            className="gap-1.5 text-xs"
          >
            <IdCard className="size-4" /> Ficha
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(`${lead.name} - ${lead.phone} - ${lead.cnpj}`);
              toast.success("Dados do cliente copiados!");
            }}
            className="text-xs"
          >
            Copiar Dados
          </Button>

          {linkPessoal && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              title="Link em que este cliente entra já reconhecido, sem cadastro."
              onClick={() => {
                void navigator.clipboard.writeText(linkPessoal);
                toast.success("Link pessoal copiado.", {
                  description: `${lead.name} entra direto, sem passar pelo cadastro.`,
                });
              }}
            >
              <LinkIcon className="size-4" /> Link do cliente
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
