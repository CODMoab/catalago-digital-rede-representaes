import * as XLSX from "xlsx";

import type { QuoteItem } from "@/lib/quotes.functions";
import { slug, type OrderSheetMeta } from "@/lib/order-sheet";
import { buildProvadorOrder } from "@/lib/provador";
import { TABELA_VAREJO } from "@/lib/tabela-preco";
import { conferirPrecos, resumoChecagem } from "@/lib/conferencia-preco";
import { modeloPayotAtual, origemDoModelo } from "@/lib/modelo-payot";

/**
 * Planilha de colagem: leva o pedido para os modelos oficiais das indústrias
 * sem tentar reescrever os arquivos delas (que têm fórmula, formatação e macro).
 *
 * Payot — a aba PEDIDO traz só os itens pedidos, código e quantidade lado a lado,
 * que é o que se digita no TOTVS e o que um robô consegue ler depois. A aba COLAR
 * continua existindo para quem preferir preencher o modelo oficial: ela é a coluna
 * QTD inteira, alinhada com as linhas do modelo do mês.
 *
 * Belliz — "Talão de Pedidos" (.xlsm): a aba _PEDIDO recebe código na coluna A e
 * quantidade na B a partir da linha 8; o resto o próprio talão preenche sozinho.
 */
const round2 = (v: number) => Math.round(v * 100) / 100;

const BELLIZ_PRIMEIRA_LINHA = 8;

export function pasteSheetFileName(meta: OrderSheetMeta) {
  const d = meta.createdAt ? new Date(meta.createdAt) : new Date();
  const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const cliente = meta.customerName?.trim() ? slug(meta.customerName) : null;
  return [meta.brandName, "ColarNoModelo", mes, cliente]
    .filter(Boolean)
    .join("_")
    .concat(".xlsx");
}

/** Onde colar, escrito para quem vai usar. */
export function pasteInstruction(brandId: "belliz" | "payot"): string {
  if (brandId !== "payot") {
    return `Abra o Talão de Pedidos Belliz, vá na aba _PEDIDO, clique na célula A${BELLIZ_PRIMEIRA_LINHA} e cole as duas colunas.`;
  }
  const m = modeloPayotAtual();
  return `Digite no TOTVS pela aba PEDIDO (código e quantidade). Para preencher o modelo oficial da Payot, use a aba COLAR na célula ${m.colunaQtd}${m.primeiraLinha}.`;
}

function abaComoUsar(brandId: "belliz" | "payot"): (string | number)[][] {
  const m = modeloPayotAtual();
  const passos =
    brandId === "payot"
      ? [
          ["PARA LANÇAR NO TOTVS (caminho normal)"],
          ["1", "Abra a aba PEDIDO: só os itens pedidos, código e quantidade."],
          ["2", "Digite item a item. A descrição está ao lado só para conferir."],
          ["3", "Se houver a aba PROVADOR, lance ela como um segundo pedido."],
          ["", ""],
          ["PARA PREENCHER O MODELO OFICIAL DA PAYOT (opcional)"],
          ["4", "Abra o modelo Tabela De Preços Payot do mês."],
          ["5", `Clique na célula ${m.colunaQtd}${m.primeiraLinha} (primeira linha da coluna QTD).`],
          ["6", "Copie a coluna inteira da aba COLAR e cole aí. Uma colagem só."],
          ["", ""],
          ["Atenção", "A aba COLAR depende da ordem das linhas do modelo. Se a Payot mudou a tabela, importe a tabela nova no painel antes de usar essa aba. A aba PEDIDO não depende disso."],
          ["Mapa", origemDoModelo(m)],
        ]
      : [
          ["1", "Abra o Talão de Pedidos Belliz do mês."],
          ["2", "Vá na aba _PEDIDO."],
          ["3", `Clique na célula A${BELLIZ_PRIMEIRA_LINHA} e cole as duas colunas da aba COLAR.`],
          ["4", "O talão preenche descrição, preço e impostos sozinho pelo código."],
          ["", ""],
          ["Atenção", "Confira o desconto e a UF no topo da aba _PEDIDO antes de enviar."],
        ];
  return [["COMO COLAR NO MODELO DA INDÚSTRIA"], [], ...passos];
}

/**
 * Monta o arquivo de colagem.
 * Payot: uma coluna alinhada com o modelo. Belliz: código e quantidade.
 */
export function buildPasteSheet(
  items: QuoteItem[],
  meta: OrderSheetMeta,
  descontoTabela: number = TABELA_VAREJO,
): Blob {
  const wb = XLSX.utils.book_new();
  const porCodigo = new Map<string, number>();
  for (const i of items) {
    porCodigo.set(i.code, (porCodigo.get(i.code) ?? 0) + i.qty);
  }

  let naoEncontrados: string[] = [];

  if (meta.brandId === "payot") {
    // Caminho normal: só os itens pedidos, na ordem em que entraram no pedido.
    // Não depende do mapa da tabela, então nunca sai torto.
    const nomes = new Map<string, string>();
    for (const i of items) if (!nomes.has(i.code)) nomes.set(i.code, i.name);
    const pedido: (string | number)[][] = [
      ["CÓDIGO", "QTDE", "DESCRIÇÃO (só para conferir)"],
      ...[...porCodigo.entries()]
        .filter(([, qtd]) => qtd > 0)
        .map(([code, qtd]) => [Number(code) || code, qtd, nomes.get(code) ?? ""]),
    ];
    const wsPedido = XLSX.utils.aoa_to_sheet(pedido);
    wsPedido["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 46 }];
    XLSX.utils.book_append_sheet(wb, wsPedido, "PEDIDO");

    const provador = buildProvadorOrder(items);
    if (provador.length > 0) {
      const wsProv = XLSX.utils.aoa_to_sheet([
        ["CÓDIGO", "QTDE", "DESCRIÇÃO (só para conferir)", "CÓDIGO COMPRADO", "QTDE COMPRADA"],
        ...provador.map((l) => [
          Number(l.code) || l.code,
          l.qty,
          l.name,
          Number(l.originCode) || l.originCode,
          l.boughtQty,
        ]),
      ]);
      wsProv["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 46 }, { wch: 16 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsProv, "PROVADOR");
    }

    const modeloPayot = modeloPayotAtual();
    const coluna = modeloPayot.linhas.map((code) => {
      if (!code) return [null];
      const qtd = porCodigo.get(code);
      return [qtd && qtd > 0 ? qtd : null];
    });
    const doModelo = new Set(modeloPayot.linhas.filter(Boolean));
    naoEncontrados = [...porCodigo.keys()].filter((c) => !doModelo.has(c));

    const wsColar = XLSX.utils.aoa_to_sheet(coluna);
    wsColar["!cols"] = [{ wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsColar, "COLAR");
  } else {
    const linhas = items
      .filter((i) => i.code && i.qty > 0)
      .map((i) => [Number(i.code) || i.code, i.qty]);
    const wsColar = XLSX.utils.aoa_to_sheet(linhas);
    wsColar["!cols"] = [{ wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsColar, "COLAR");
  }

  // Conferência: o que foi para a colagem, em texto legível
  const conf: (string | number)[][] = [
    [`CONFERÊNCIA — ${meta.brandName.toUpperCase()}`],
    ["Cliente", meta.customerName || "—"],
    ["CNPJ", meta.customerCnpj || "—"],
    [pasteInstruction(meta.brandId)],
    [],
    ["CÓDIGO", "DESCRIÇÃO", "QTDE", "PREÇO UN.", "TOTAL", "CONFERIR"],
    ...items.map((i) => [
      i.code,
      i.name,
      i.qty,
      round2(i.unitPrice),
      round2(i.qty * i.unitPrice),
      i.review ? `⚠ ${i.reviewNote || "conferir com o cliente"}` : "",
    ]),
    [],
    [
      "",
      "TOTAL",
      items.reduce((s, i) => s + i.qty, 0),
      "",
      round2(items.reduce((s, i) => s + i.qty * i.unitPrice, 0)),
      "",
    ],
  ];

  if (naoEncontrados.length > 0) {
    conf.push([], [
      "ATENÇÃO",
      `${naoEncontrados.length} item(ns) não existem no modelo desta tabela e ficaram de fora da aba COLAR (a aba PEDIDO tem todos): ${naoEncontrados.join(", ")}`,
    ]);
  }

  if (meta.brandId === "payot" && buildProvadorOrder(items).length > 0) {
    conf.push([], [
      "PROVADOR",
      "Os itens bonificados estão na aba PROVADOR. Lançar como um segundo pedido.",
    ]);
  }

  // Regra do sistema: o preço do catálogo já é o líquido, nada desconta em cima
  const checagem = conferirPrecos(items, meta.brandId, descontoTabela);
  conf.push([], ["CONFERÊNCIA DE PREÇO", resumoChecagem(checagem)]);
  for (const d of checagem.divergencias.slice(0, 20)) {
    conf.push([
      d.code,
      d.name,
      "",
      d.esperado,
      d.encontrado,
      `diferença de ${d.percentual > 0 ? "+" : ""}${d.percentual.toFixed(1)}% em relação à tabela`,
    ]);
  }

  const wsConf = XLSX.utils.aoa_to_sheet(conf);
  wsConf["!cols"] = [{ wch: 16 }, { wch: 46 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, wsConf, "CONFERENCIA");

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(abaComoUsar(meta.brandId)),
    "COMO USAR",
  );

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
