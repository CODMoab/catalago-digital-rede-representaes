import * as XLSX from "xlsx";

import type { QuoteItem } from "@/lib/quotes.functions";

export type OrderSheetMeta = {
  brandId: "belliz" | "payot";
  brandName: string;
  customerName: string;
  customerPhone: string;
  customerCnpj: string;
  createdAt?: string;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

const slug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "cliente";

export function orderSheetFileName(meta: OrderSheetMeta) {
  const d = meta.createdAt ? new Date(meta.createdAt) : new Date();
  const date = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  return `Pedido-${meta.brandName}-${slug(meta.customerName)}-${date}.xlsx`;
}

/**
 * Monta a planilha do pedido no padrão de cada empresa:
 * - Belliz: venda por coletivo (qtde de coletivos + unidades), preço líquido unitário.
 * - Payot: venda por unidade, com EAN-13 e preço de representante.
 */
export function buildOrderSheet(items: QuoteItem[], meta: OrderSheetMeta): Blob {
  const isBelliz = meta.brandId === "belliz";
  const created = meta.createdAt ? new Date(meta.createdAt) : new Date();

  const header: (string | number)[][] = [
    [`PEDIDO ${meta.brandName.toUpperCase()}`],
    ["Cliente", meta.customerName],
    ["CNPJ", meta.customerCnpj],
    ["Telefone", meta.customerPhone],
    ["Data", created.toLocaleDateString("pt-BR")],
    [],
  ];

  const cols = isBelliz
    ? ["CÓDIGO", "DESCRIÇÃO", "MARCA", "EAN-13", "COLETIVO", "QTDE COLETIVOS", "QTDE UNIDADES", "PREÇO LÍQUIDO UN.", "TOTAL"]
    : ["CÓDIGO", "DESCRIÇÃO", "LINHA", "EAN-13", "QTDE", "PREÇO", "TOTAL"];

  const body = items.map((i) => {
    const total = round2(i.qty * i.unitPrice);
    return isBelliz
      ? [
          i.code,
          i.name,
          i.line ?? "",
          i.ean ?? "",
          i.pack || 1,
          Math.round(i.qty / Math.max(1, i.pack || 1)),
          i.qty,
          round2(i.unitPrice),
          total,
        ]
      : [i.code, i.name, i.line ?? "", i.ean ?? "", i.qty, round2(i.unitPrice), total];
  });

  const totalGeral = round2(items.reduce((s, i) => s + i.qty * i.unitPrice, 0));
  const totalUnits = items.reduce((s, i) => s + i.qty, 0);
  const totalRow: (string | number)[] = isBelliz
    ? ["", "TOTAL DO PEDIDO", "", "", "", "", totalUnits, "", totalGeral]
    : ["", "TOTAL DO PEDIDO", "", "", totalUnits, "", totalGeral];

  const aoa = [...header, cols, ...body, [], totalRow, [], ["Entrega CIF · valores sem impostos"]];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = isBelliz
    ? [{ wch: 12 }, { wch: 46 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 14 }]
    : [{ wch: 12 }, { wch: 46 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido");
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
