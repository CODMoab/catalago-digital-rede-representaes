import * as XLSX from "xlsx";

import type { QuoteItem } from "@/lib/quotes.functions";
import { buildProvadorOrder, PROVADOR_A_CADA } from "@/lib/provador";

export type OrderSheetMeta = {
  brandId: "belliz" | "payot";
  brandName: string;
  customerName: string;
  customerPhone: string;
  customerCnpj: string;
  createdAt?: string;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

export const slug = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "cliente";

/**
 * Padrao de arquivo: Marca_Orcamento_AAAA-MM_Cliente_CNPJ.xlsx
 * Cliente e CNPJ sao opcionais — nem sempre chegam junto com o pedido.
 */
export function orderSheetFileName(meta: OrderSheetMeta) {
  const d = meta.createdAt ? new Date(meta.createdAt) : new Date();
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const cnpj = (meta.customerCnpj || "").replace(/\D/g, "");
  const partes = [
    slug(meta.brandName),
    "Orcamento",
    mes,
    meta.customerName?.trim() ? slug(meta.customerName) : null,
    cnpj || null,
  ].filter(Boolean);
  return `${partes.join("_")}.xlsx`;
}

/**
 * Monta a planilha do pedido no padrão de cada empresa:
 * - Belliz: venda por coletivo (qtde de coletivos + unidades), preço líquido unitário.
 * - Payot: venda por unidade, com EAN-13 e preço de representante.
 */
export function buildOrderSheet(items: QuoteItem[], meta: OrderSheetMeta): Blob {
  const isBelliz = meta.brandId === "belliz";
  // Itens que a leitura automatica nao conseguiu confirmar ganham uma coluna de alerta
  const hasReview = items.some((i) => i.review);
  const created = meta.createdAt ? new Date(meta.createdAt) : new Date();

  const header: (string | number)[][] = [
    [`PEDIDO ${meta.brandName.toUpperCase()}`],
    ["Cliente", meta.customerName],
    ["CNPJ", meta.customerCnpj],
    ["Telefone", meta.customerPhone],
    ["Data", created.toLocaleDateString("pt-BR")],
    [],
  ];

  const baseCols = isBelliz
    ? ["CÓDIGO", "DESCRIÇÃO", "MARCA", "EAN-13", "COLETIVO", "QTDE COLETIVOS", "QTDE UNIDADES", "PREÇO LÍQUIDO UN.", "TOTAL"]
    : ["CÓDIGO", "DESCRIÇÃO", "LINHA", "EAN-13", "QTDE", "PREÇO", "TOTAL"];
  const cols = hasReview ? [...baseCols, "CONFERIR"] : baseCols;

  const body = items.map((i) => {
    const total = round2(i.qty * i.unitPrice);
    const alerta = i.review ? `⚠ ${i.reviewNote || "conferir com o cliente"}` : "";
    const linha = isBelliz
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
    return hasReview ? [...linha, alerta] : linha;
  });

  const totalGeral = round2(items.reduce((s, i) => s + i.qty * i.unitPrice, 0));
  const totalUnits = items.reduce((s, i) => s + i.qty, 0);
  const baseTotalRow: (string | number)[] = isBelliz
    ? ["", "TOTAL DO PEDIDO", "", "", "", "", totalUnits, "", totalGeral]
    : ["", "TOTAL DO PEDIDO", "", "", totalUnits, "", totalGeral];
  const totalRow = hasReview ? [...baseTotalRow, ""] : baseTotalRow;

  const rodape: (string | number)[][] = [[], ["Entrega CIF · valores sem impostos"]];
  if (hasReview) {
    rodape.push([
      "ATENÇÃO: itens marcados na coluna CONFERIR foram lidos automaticamente e precisam de conferência antes do envio à indústria.",
    ]);
  }
  const aoa = [...header, cols, ...body, [], totalRow, ...rodape];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const baseWidths = isBelliz
    ? [{ wch: 12 }, { wch: 46 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 18 }, { wch: 14 }]
    : [{ wch: 12 }, { wch: 46 }, { wch: 20 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 14 }];
  ws["!cols"] = hasReview ? [...baseWidths, { wch: 34 }] : baseWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pedido");

  // Payot: a bonificação é lançada como um segundo pedido na indústria,
  // então ela sai numa aba própria, pronta para ser digitada.
  if (!isBelliz) {
    const provador = buildProvadorOrder(items);
    if (provador.length > 0) {
      const totalBonificado = provador.reduce((soma, l) => soma + l.qty, 0);
      const aoaProv: (string | number)[][] = [
        [`PEDIDO PROVADOR ${meta.brandName.toUpperCase()}`],
        ["Cliente", meta.customerName],
        ["CNPJ", meta.customerCnpj],
        ["Data", created.toLocaleDateString("pt-BR")],
        [`Regra: a cada ${PROVADOR_A_CADA} unidades compradas, 1 bonificada`],
        [],
        [
          "CÓDIGO PROVADOR",
          "CÓDIGO DO ITEM",
          "DESCRIÇÃO",
          "LINHA",
          "QTDE COMPRADA",
          "QTDE BONIFICADA",
        ],
        ...provador.map((l) => [l.code, l.originCode, l.name, l.line, l.boughtQty, l.qty]),
        [],
        ["", "TOTAL BONIFICADO", "", "", "", totalBonificado],
        [],
        ["Lançar como pedido separado no sistema da indústria."],
        [
          "Os códigos de provador seguem a regra 4→5 / 7→8 e não constam no catálogo de venda: confira antes de enviar.",
        ],
      ];
      const wsProv = XLSX.utils.aoa_to_sheet(aoaProv);
      wsProv["!cols"] = [
        { wch: 18 },
        { wch: 16 },
        { wch: 46 },
        { wch: 20 },
        { wch: 16 },
        { wch: 18 },
      ];
      XLSX.utils.book_append_sheet(wb, wsProv, "Provador");
    }
  }
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
