import { useMemo } from "react";
import {
  Building2,
  MapPin,
  MessageCircle,
  ShoppingBag,
  TrendingUp,
  CalendarClock,
  Package,
  FileSpreadsheet,
  AlertCircle,
  Gift,
} from "lucide-react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BRANDS, type BrandId } from "@/lib/catalog";
import { formatCnpj, formatPhone, onlyDigits } from "@/lib/leads";
import { sourceLabel, type QuoteRecord } from "@/lib/quotes.functions";
import type { ReactivationLead } from "@/lib/leads.functions";
import { buildCustomerProfile } from "@/lib/customer-profile";
import { buildOrderSheet, downloadBlob, orderSheetFileName } from "@/lib/order-sheet";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dataBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

interface CustomerProfileDialogProps {
  /** CNPJ ou telefone (só dígitos) do cliente a exibir. Null fecha a ficha. */
  customerKey: string | null;
  onOpenChange: (open: boolean) => void;
  leads: ReactivationLead[];
  quotes: QuoteRecord[];
}

export function CustomerProfileDialog({
  customerKey,
  onOpenChange,
  leads,
  quotes,
}: CustomerProfileDialogProps) {
  const profile = useMemo(
    () => (customerKey ? buildCustomerProfile(customerKey, leads, quotes) : null),
    [customerKey, leads, quotes],
  );

  const baixarPlanilha = (q: QuoteRecord) => {
    const brand = (q.brand_id === "payot" ? "payot" : "belliz") as BrandId;
    const meta = {
      brandId: brand,
      brandName: BRANDS[brand].name,
      customerName: q.customer_name,
      customerPhone: q.customer_phone,
      customerCnpj: q.customer_cnpj,
      createdAt: q.created_at,
    };
    downloadBlob(buildOrderSheet(q.items ?? [], meta), orderSheetFileName(meta));
  };

  const whatsappUrl = useMemo(() => {
    if (!profile) return "";
    const tel = onlyDigits(profile.phone);
    if (tel.length < 10) return "";
    const primeiro = profile.name.split(" ")[0];
    const msg = profile.ordersCount
      ? `Olá, *${primeiro}*! Aqui é da *Rede Representações*.\n\nPassando para saber como estão as vendas na sua loja e se já é hora de repor o estoque de *${
          profile.byBrand.belliz.orders >= profile.byBrand.payot.orders ? "Belliz" : "Payot"
        }*.`
      : `Olá, *${primeiro}*! Aqui é da *Rede Representações*.\n\nVi que você se cadastrou no nosso Catálogo Digital e ainda não fez o primeiro pedido. Posso te ajudar a montar o mix ideal para a sua loja?`;
    return `https://wa.me/55${tel}?text=${encodeURIComponent(msg)}`;
  }, [profile]);

  return (
    <Dialog open={Boolean(customerKey)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[95vh] w-[95vw] max-w-3xl overflow-y-auto p-0">
        {!profile ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 size-6" />
            Não encontrei dados deste cliente.
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="border-b border-border bg-muted/40 px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    <Building2 className="size-3.5" /> Ficha do cliente
                  </span>
                  <h2 className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">
                    {profile.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {profile.cnpj && (
                      <>
                        CNPJ:{" "}
                        <strong className="font-mono text-foreground">
                          {formatCnpj(profile.cnpj)}
                        </strong>{" "}
                        ·{" "}
                      </>
                    )}
                    WhatsApp:{" "}
                    <strong className="text-foreground">
                      {formatPhone(profile.phone)}
                    </strong>
                    {profile.city && (
                      <>
                        {" · "}
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3" />
                          {profile.city}/{profile.state || "BA"}
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {profile.isLead ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                      <Gift className="size-3.5" /> Cadastrado no catálogo
                      {profile.discountPercent ? ` · ${profile.discountPercent}% OFF` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
                      Só em pedidos lançados
                    </span>
                  )}
                  {whatsappUrl && (
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                      <Button
                        size="sm"
                        className="gap-1.5 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <MessageCircle className="size-4" /> Falar no WhatsApp
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-6 p-6">
              {/* Números do cliente */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi
                  icon={<ShoppingBag className="size-4 text-primary" />}
                  label="Pedidos"
                  value={String(profile.ordersCount)}
                  hint={profile.isLead ? `Cadastro em ${dataBr(profile.registeredAt)}` : ""}
                />
                <Kpi
                  icon={<TrendingUp className="size-4 text-primary" />}
                  label="Total comprado"
                  value={brl(profile.totalValue)}
                  hint={
                    profile.ordersCount > 1
                      ? `Ticket médio ${brl(profile.avgTicket)}`
                      : ""
                  }
                />
                <Kpi
                  icon={<CalendarClock className="size-4 text-primary" />}
                  label="Último pedido"
                  value={dataBr(profile.lastOrderAt)}
                  hint={
                    profile.daysSinceLastOrder !== null
                      ? `há ${profile.daysSinceLastOrder} dia(s)`
                      : "nunca comprou"
                  }
                  alerta={
                    profile.daysSinceLastOrder !== null &&
                    profile.daysSinceLastOrder > 60
                  }
                />
                <Kpi
                  icon={<Package className="size-4 text-primary" />}
                  label="Marcas"
                  value={
                    profile.byBrand.belliz.orders && profile.byBrand.payot.orders
                      ? "Ambas"
                      : profile.byBrand.belliz.orders
                        ? "Belliz"
                        : profile.byBrand.payot.orders
                          ? "Payot"
                          : "—"
                  }
                  hint={
                    profile.ordersCount > 0
                      ? `B ${brl(profile.byBrand.belliz.total)} · P ${brl(profile.byBrand.payot.total)}`
                      : ""
                  }
                />
              </div>

              {profile.ordersCount === 0 && (
                <div className="rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 text-xs">
                  <p className="font-bold text-amber-700">
                    Cadastrou-se mas nunca comprou
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Ganhou o desconto na roleta e não fechou o primeiro pedido. É a melhor
                    oportunidade de reativação da base.
                  </p>
                </div>
              )}

              {/* O que ele costuma repor */}
              {profile.topProducts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    O que ele mais compra
                  </h3>
                  <div className="mt-2 space-y-1.5">
                    {profile.topProducts.map((p) => (
                      <div
                        key={p.code}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            [{p.code}] · em {p.orders} pedido(s)
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-bold">{p.units} un</p>
                          <p className="text-[11px] text-muted-foreground">
                            {brl(p.total)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Histórico */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Histórico de pedidos
                </h3>
                {profile.quotes.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Nenhum pedido registrado para este cliente.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {profile.quotes.map((q) => {
                      const brand = q.brand_id === "payot" ? "payot" : "belliz";
                      return (
                        <div
                          key={q.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground">
                                {BRANDS[brand].name}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {sourceLabel(q.source)}
                              </span>
                              <span className="text-[11px] text-muted-foreground">
                                {new Date(q.created_at).toLocaleString("pt-BR")}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {q.items_count} produtos · {q.units_count} unidades ·{" "}
                              <strong className="text-primary">
                                {brl(Number(q.total))}
                              </strong>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                q.status === "faturado"
                                  ? "bg-emerald-500/15 text-emerald-700"
                                  : q.status === "cancelado"
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {q.status}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-xs"
                              onClick={() => baixarPlanilha(q)}
                            >
                              <FileSpreadsheet className="size-3.5" /> Planilha
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({
  icon,
  label,
  value,
  hint,
  alerta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        alerta ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-medium">{label}</span>
        {icon}
      </div>
      <p className="mt-1 truncate text-lg font-black">{value}</p>
      {hint && <p className="truncate text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
