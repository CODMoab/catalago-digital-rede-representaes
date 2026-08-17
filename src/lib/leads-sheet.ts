import * as XLSX from "xlsx";

import type { ReactivationLead } from "@/lib/leads.functions";
import { formatCnpj, formatPhone } from "@/lib/leads";

const round2 = (v: number) => Math.round(v * 100) / 100;

const dateBr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "";

export function leadsSheetFileName() {
  const d = new Date();
  const date = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  return `Leads-Rede-Representacoes-${date}.xlsx`;
}

/**
 * Planilha da base de leads captados no catálogo, com o cruzamento de pedidos
 * já feito pelo painel (quem cadastrou e ainda não comprou fica marcado).
 */
export function buildLeadsSheet(leads: ReactivationLead[]): Blob {
  const created = new Date();

  const header: (string | number)[][] = [
    ["BASE DE LEADS — REDE REPRESENTAÇÕES"],
    ["Gerado em", created.toLocaleString("pt-BR")],
    ["Total de cadastros", leads.length],
    ["Sem pedido", leads.filter((l) => !l.has_ordered).length],
    [],
  ];

  const cols = [
    "LOJA / RAZÃO SOCIAL",
    "CNPJ",
    "WHATSAPP",
    "CIDADE",
    "UF",
    "DESCONTO %",
    "CADASTRADO EM",
    "PEDIDOS",
    "TOTAL ORÇADO",
    "ÚLTIMO PEDIDO",
    "SITUAÇÃO",
  ];

  const body = leads.map((l) => [
    l.name,
    formatCnpj(l.cnpj),
    formatPhone(l.phone),
    l.city || "",
    l.state || "BA",
    l.discount_percent,
    dateBr(l.created_at),
    l.quotes_count,
    round2(l.quotes_total),
    dateBr(l.last_quote_at),
    l.has_ordered ? "Cliente ativo" : "Sem pedido · reativar",
  ]);

  const totalValue = round2(leads.reduce((s, l) => s + Number(l.quotes_total || 0), 0));
  const totalRow: (string | number)[] = [
    "",
    "TOTAL",
    "",
    "",
    "",
    "",
    "",
    leads.reduce((s, l) => s + l.quotes_count, 0),
    totalValue,
    "",
    "",
  ];

  const aoa = [...header, cols, ...body, [], totalRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 38 },
    { wch: 20 },
    { wch: 18 },
    { wch: 22 },
    { wch: 6 },
    { wch: 12 },
    { wch: 16 },
    { wch: 10 },
    { wch: 16 },
    { wch: 16 },
    { wch: 22 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
