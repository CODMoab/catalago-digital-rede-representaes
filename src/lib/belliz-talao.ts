import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";

import type { QuoteItem } from "@/lib/quotes.functions";

/**
 * Preenche o Talão de Pedidos oficial da Belliz sem reescrever o arquivo.
 *
 * O .xlsm é um pacote de arquivos XML. Em vez de gerar uma planilha nova — o que
 * jogaria fora as macros e as 9 abas escondidas que fazem o talão calcular — a
 * gente abre o pacote, escreve o código e a quantidade nas células que já estão
 * lá vazias, e fecha o pacote de volta. Todo o resto sai byte a byte igual.
 *
 * A aba _PEDIDO já vem com fórmula pronta em ~1.790 linhas, a partir da 8: basta
 * o código na coluna A que descrição, marca, preço e imposto aparecem sozinhos.
 * Como os valores em cache ficam velhos, o arquivo pede recálculo ao abrir.
 */
export const TALAO_PRIMEIRA_LINHA = 8;
const ABA_PEDIDO = "_PEDIDO";
const MIME_XLSM = "application/vnd.ms-excel.sheet.macroEnabled.12";

export type TalaoResultado = {
  blob: Blob;
  /** Linhas escritas na aba _PEDIDO. */
  lancados: number;
  /** Itens deixados de fora (sem código utilizável). */
  ignorados: string[];
  ultimaLinha: number;
};

export class TalaoInvalido extends Error {}

/** Acha o XML da aba _PEDIDO seguindo o mesmo caminho que o Excel segue. */
function caminhoDaAba(arquivos: Record<string, Uint8Array>): string {
  const workbook = arquivos["xl/workbook.xml"];
  const rels = arquivos["xl/_rels/workbook.xml.rels"];
  if (!workbook || !rels) {
    throw new TalaoInvalido("Esse arquivo não parece o Talão de Pedidos da Belliz.");
  }
  const wb = strFromU8(workbook);
  const sheet = new RegExp(`<sheet[^>]*name="${ABA_PEDIDO}"[^>]*>`).exec(wb)?.[0];
  const rid = sheet ? /r:id="([^"]+)"/.exec(sheet)?.[1] : null;
  if (!rid) {
    throw new TalaoInvalido(
      `Não achei a aba ${ABA_PEDIDO} nesse arquivo. Confira se é o Talão de Pedidos da Belliz.`,
    );
  }
  const alvo = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(strFromU8(rels))?.[1];
  if (!alvo) throw new TalaoInvalido("O talão está com a aba _PEDIDO quebrada.");
  return `xl/${alvo.replace(/^\/?xl\//, "").replace(/^\//, "")}`;
}

/** Onde começa e termina o elemento <c> de uma célula, a partir de um ponto. */
function acharCelula(xml: string, ref: string, apartirDe: number) {
  const inicio = xml.indexOf(`<c r="${ref}"`, apartirDe);
  if (inicio < 0) return null;
  const fimTag = xml.indexOf(">", inicio);
  if (fimTag < 0) return null;
  const abertura = xml.slice(inicio, fimTag + 1);
  const fim = abertura.endsWith("/>") ? fimTag + 1 : xml.indexOf("</c>", fimTag) + 4;
  return { inicio, fim, estilo: /\ss="(\d+)"/.exec(abertura)?.[1] ?? "" };
}

function celula(ref: string, estilo: string, valor: string | number): string {
  const s = estilo ? ` s="${estilo}"` : "";
  return typeof valor === "number"
    ? `<c r="${ref}"${s}><v>${valor}</v></c>`
    : `<c r="${ref}"${s} t="inlineStr"><is><t>${valor.replace(/[<>&]/g, "")}</t></is></c>`;
}

/**
 * Escreve as células de uma vez só, andando para frente no XML.
 * A aba tem 13 MB: refazer o texto a cada célula seria lento demais.
 */
function escreveCelulas(
  xml: string,
  escritas: { ref: string; valor: string | number }[],
): string {
  const partes: string[] = [];
  let cursor = 0;
  for (const { ref, valor } of escritas) {
    const alvo = acharCelula(xml, ref, cursor);
    if (!alvo) {
      throw new TalaoInvalido(
        `A célula ${ref} não existe nesse talão. O pedido é maior do que as linhas disponíveis.`,
      );
    }
    partes.push(xml.slice(cursor, alvo.inicio), celula(ref, alvo.estilo, valor));
    cursor = alvo.fim;
  }
  partes.push(xml.slice(cursor));
  return partes.join("");
}

export function preencherTalaoBelliz(
  arquivo: ArrayBuffer,
  items: QuoteItem[],
): TalaoResultado {
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(new Uint8Array(arquivo));
  } catch {
    throw new TalaoInvalido("Não consegui abrir esse arquivo. Ele precisa ser o .xlsm da Belliz.");
  }

  // Um item por código, somando as quantidades, na ordem em que entraram
  const porCodigo = new Map<string, number>();
  const ignorados: string[] = [];
  for (const i of items) {
    const code = String(i.code ?? "").trim();
    if (!code || i.qty <= 0) {
      ignorados.push(i.name || "(sem nome)");
      continue;
    }
    porCodigo.set(code, (porCodigo.get(code) ?? 0) + i.qty);
  }
  if (porCodigo.size === 0) throw new TalaoInvalido("Esse pedido não tem nenhum item com código.");

  const escritas: { ref: string; valor: string | number }[] = [];
  let linha = TALAO_PRIMEIRA_LINHA;
  for (const [code, qtd] of porCodigo) {
    const numero = Number(code);
    escritas.push({ ref: `A${linha}`, valor: Number.isFinite(numero) && code !== "" ? numero : code });
    escritas.push({ ref: `B${linha}`, valor: qtd });
    linha += 1;
  }

  const caminho = caminhoDaAba(arquivos);
  const aba = arquivos[caminho];
  if (!aba) throw new TalaoInvalido("O talão está sem a aba de pedido.");
  arquivos[caminho] = strToU8(escreveCelulas(strFromU8(aba), escritas));

  // Os valores das fórmulas estão em cache e ficaram velhos: manda recalcular
  const wb = strFromU8(arquivos["xl/workbook.xml"]!);
  arquivos["xl/workbook.xml"] = strToU8(
    wb.includes("fullCalcOnLoad")
      ? wb
      : wb.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>'),
  );

  const saida = zipSync(arquivos, { level: 6 });
  return {
    blob: new Blob([saida as unknown as BlobPart], { type: MIME_XLSM }),
    lancados: porCodigo.size,
    ignorados,
    ultimaLinha: linha - 1,
  };
}

export function talaoFileName(cliente: string | null | undefined, criadoEm?: string): string {
  const d = criadoEm ? new Date(criadoEm) : new Date();
  const data = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  const nome = (cliente || "").trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
  return ["Talao de Pedidos Belliz", nome || null, data].filter(Boolean).join("_") + ".xlsm";
}
