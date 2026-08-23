import * as XLSX from "xlsx";

import type { ImportRow } from "@/lib/catalog.functions";
import { PAYOT } from "@/lib/catalog";
import { modeloPayotAtual, type ModeloPayot } from "@/lib/modelo-payot";

/**
 * Leitura da tabela de preços oficial da Payot.
 *
 * O arquivo é uma planilha só ("Table 1") com cabeçalho na linha 10 e os
 * produtos das linhas 11 em diante. Linhas de grupo ("LINHA VITAMINA C") têm
 * texto na coluna A e mais nada.
 *
 *   A CÓDIGO · B DESCRIÇÃO · C EAN-13 · D PRÇ CHEIO · E PREÇO · F QTD · G TOTAL
 *
 * Além dos produtos, a leitura devolve o mapa de linhas — é ele que mantém a
 * colagem da coluna QTD alinhada quando a indústria muda a tabela.
 */
export type MudancaPreco = {
  code: string;
  name: string;
  de: number;
  para: number;
  percentual: number;
};

export type DiffTabela = {
  novos: { code: string; name: string }[];
  sairam: { code: string; name: string }[];
  precos: MudancaPreco[];
  /** true quando a posição de algum produto mudou — é o que quebra a colagem. */
  layoutMudou: boolean;
  totalProdutos: number;
};

export type LeituraTabela = {
  produtos: ImportRow[];
  modelo: ModeloPayot;
  diff: DiffTabela;
  /** Desconto que a tabela traz embutido: 15 no varejo, 25 no distribuidor. */
  descontoDetectado: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

function texto(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(texto(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** Acha a linha do cabeçalho procurando a palavra CÓDIGO na primeira coluna. */
function acharCabecalho(linhas: unknown[][]): number {
  for (let i = 0; i < Math.min(linhas.length, 40); i += 1) {
    const primeira = texto(linhas[i]?.[0]).toUpperCase();
    if (primeira.startsWith("C") && primeira.replace(/[^A-Z]/g, "") === "CDIGO") return i;
  }
  return -1;
}

export function lerTabelaPayot(buffer: ArrayBuffer): LeituraTabela {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error("A planilha está vazia.");

  const linhas = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    blankrows: true,
    defval: null,
  }) as unknown[][];

  const iCabecalho = acharCabecalho(linhas);
  if (iCabecalho < 0) {
    throw new Error(
      "Não achei o cabeçalho CÓDIGO / DESCRIÇÃO. Confira se é a Tabela de Preços da Payot.",
    );
  }

  const primeiraLinha = iCabecalho + 2; // 1-based, logo após o cabeçalho
  const produtos: ImportRow[] = [];
  const mapaLinhas: string[] = [];
  let linhaAtual = "";

  for (let i = iCabecalho + 1; i < linhas.length; i += 1) {
    const r = linhas[i] ?? [];
    const a = r[0];
    const descricao = texto(r[1]);

    // Fim da tabela: a última linha é o TOTAL
    if (!a && /^total$/i.test(texto(r[2]))) break;

    if (typeof a !== "number" && texto(a) && !descricao) {
      linhaAtual = texto(a).replace(/^linha\s+/i, "");
      mapaLinhas.push("");
      continue;
    }

    const code = texto(a);
    if (!code || !descricao) {
      mapaLinhas.push("");
      continue;
    }

    mapaLinhas.push(code);
    produtos.push({
      brand_id: "payot",
      code,
      name: descricao,
      line: linhaAtual,
      ean: texto(r[2]),
      price_unit: round2(numero(r[4])),
      price_full: round2(numero(r[3])) || null,
      coletivo: 1,
      price_coletivo: null,
    });
  }

  if (produtos.length === 0) {
    throw new Error("Não encontrei nenhum produto nessa planilha.");
  }

  const modelo: ModeloPayot = {
    primeiraLinha,
    colunaQtd: "F",
    linhas: mapaLinhas,
    atualizadoEm: new Date().toISOString(),
  };

  return {
    produtos,
    modelo,
    diff: compararComAtual(produtos, modelo),
    descontoDetectado: detectarDesconto(produtos),
  };
}

/**
 * Qual tabela é esta, olhando a relação entre o preço cheio e o preço praticado.
 * Varejo desconta 15%, distribuidor 25%. Serve para não trocar uma pela outra
 * sem querer e derrubar o preço do catálogo inteiro.
 */
function detectarDesconto(produtos: ImportRow[]): number {
  const razoes = produtos
    .filter((p) => p.price_full && p.price_full > 0 && p.price_unit > 0)
    .map((p) => p.price_unit / (p.price_full as number))
    .sort((a, b) => a - b);
  if (razoes.length === 0) return 0;
  const mediana = razoes[Math.floor(razoes.length / 2)];
  return Math.round((1 - mediana) * 100);
}

/** Compara a tabela nova com a que o sistema usa hoje. */
function compararComAtual(produtos: ImportRow[], modelo: ModeloPayot): DiffTabela {
  const atuais = new Map(PAYOT.map((p) => [String(p.code), p]));
  const novosCodigos = new Set(produtos.map((p) => p.code));

  const novos = produtos
    .filter((p) => !atuais.has(p.code))
    .map((p) => ({ code: p.code, name: p.name }));

  const sairam = [...atuais.values()]
    .filter((p) => !novosCodigos.has(String(p.code)))
    .map((p) => ({ code: String(p.code), name: p.name }));

  const precos: MudancaPreco[] = [];
  for (const p of produtos) {
    const antigo = atuais.get(p.code);
    if (!antigo) continue;
    const de = round2(antigo.price);
    const para = p.price_unit;
    if (Math.abs(de - para) > 0.01) {
      precos.push({
        code: p.code,
        name: p.name,
        de,
        para,
        percentual: de > 0 ? ((para - de) / de) * 100 : 0,
      });
    }
  }

  const atual = modeloPayotAtual();
  const layoutMudou =
    atual.primeiraLinha !== modelo.primeiraLinha ||
    atual.linhas.length !== modelo.linhas.length ||
    atual.linhas.some((c, i) => c !== modelo.linhas[i]);

  return { novos, sairam, precos, layoutMudou, totalProdutos: produtos.length };
}
