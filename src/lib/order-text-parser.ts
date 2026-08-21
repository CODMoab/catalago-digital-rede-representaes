import { BELLIZ, PAYOT, type BrandId } from "@/lib/catalog";
import type { ExtractedOrder } from "@/lib/order-import.functions";
import { norm } from "@/lib/order-import";

/**
 * Leitor local de pedido em texto.
 *
 * Faz o mesmo trabalho que a IA faz na leitura de texto — quebrar cada linha em
 * produto, quantidade e preço — mas de graça e na hora. Só entende as formas de
 * escrever que aparecem no dia a dia; o que fugir disso volta em `ignoradas`
 * para o usuário mandar para a IA.
 *
 * O casamento com o catálogo continua sendo feito por matchExtractedOrder.
 */
export type LocalParseResult = {
  order: ExtractedOrder;
  /** Linhas que não deu para entender — candidatas à leitura por IA. */
  ignoradas: string[];
  /** Alertas sobre a leitura como um todo (marcas misturadas, por exemplo). */
  avisos: string[];
};

type ExtractedItem = ExtractedOrder["itens"][number];

const UNIT_BOX =
  "cxs?|caixas?|coletivos?|conjuntos?|cjto|dps?|displays?|pcts?|pacotes?|fardos?";
const UNIT_EACH = "un|und|unid|unidades?|pcs?|pe[cç]as?|frascos?";

/** Palavras que sozinhas não indicam produto nenhum. */
const RUIDO = new Set([
  "bom","dia","boa","tarde","noite","oi","ola","opa","obrigado","obrigada",
  "favor","por","tudo","bem","blz","ok","valeu","abraco","abracos","urgente",
  "pedido","pedidos","orcamento","segue","seguem","manda","mandar","quero",
  "queria","preciso","precisava","gostaria","anota","anotar","fazer","pode",
  "total","entrega","prazo","frete","desconto","pagamento","boleto","vencimento",
  "cliente","loja","empresa","cnpj","whatsapp","telefone","obs","observacao",
  "att","atenciosamente","confirma","confirmado","ficou","fica","valor","reais",
]);

/** Palavras que aparecem no catálogo — usadas para saber se a linha é produto. */
function catalogWords(list: { name: string; line?: string }[]): Set<string> {
  const set = new Set<string>();
  for (const p of list) {
    for (const w of norm(`${p.name} ${p.line ?? ""}`).split(" ")) {
      if (w.length >= 3) set.add(w);
    }
  }
  return set;
}

const PALAVRAS_BELLIZ = catalogWords(BELLIZ);
const PALAVRAS_PAYOT = catalogWords(PAYOT);
const CODIGOS = new Set<string>([
  ...BELLIZ.map((p) => String(p.code)),
  ...PAYOT.map((p) => String(p.code)),
]);

const digits = (v: string) => (v ?? "").replace(/\D/g, "");

/** Tokens da linha que valem alguma coisa na hora de reconhecer o produto. */
function tokensUteis(v: string): string[] {
  return norm(v)
    .split(" ")
    .filter((t) => t.length >= 3 && !RUIDO.has(t));
}

/** Quantas palavras da linha existem no catálogo de cada marca. */
function acertos(tokens: string[], palavras: Set<string>): number {
  return tokens.filter((t) => palavras.has(t)).length;
}

function numeroBr(v: string): number {
  const limpo = v.replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/** Tira prefixo de export do WhatsApp: "[12/08/2026 10:33] Fulano:" */
function tiraCabecalhoWhatsapp(linha: string): string {
  return linha.replace(
    /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4}[^\]]*\]?\s*(?:[^:]{1,40}:)?\s*/,
    "",
  );
}

type LinhaLida = {
  item: ExtractedItem | null;
  /** Linha aproveitável como observação geral (prazo, frete, desconto). */
  observacao: string | null;
};

const RE_OBS = /(prazo|frete|entrega|desconto|boleto|vencimento|pagamento|parcel)/i;

function lerLinha(original: string): LinhaLida {
  let resto = tiraCabecalhoWhatsapp(original).trim();
  resto = resto.replace(/^[\s\-–—*•·>+]+/, "").trim();

  if (!resto) return { item: null, observacao: null };

  // "1) Pente ..." é numeração de lista, não quantidade
  const enumerado = resto.match(/^(\d{1,2})\s*[).]\s+(.+)$/);
  if (enumerado && /\d/.test(enumerado[2])) resto = enumerado[2];

  const notas: string[] = [];
  let preco = 0;
  let quantidade = 0;
  let unidade = "";
  let codigo = "";
  let ean = "";

  // Preço só quando vem explícito, para não confundir com quantidade
  const mPreco = resto.match(/r\$\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{1,2})/i);
  if (mPreco) {
    preco = numeroBr(mPreco[1]);
    resto = resto.replace(mPreco[0], " ");
  }

  const mEan = resto.match(/\b\d{12,14}\b/);
  if (mEan) {
    ean = mEan[0];
    resto = resto.replace(mEan[0], " ");
  }

  const mCod = resto.match(
    /\b(?:cod|c[oó]d(?:igo)?|ref(?:er[eê]ncia)?|item)\.?\s*n?[oº°]?\s*:?\s*(\d{2,6})\b/i,
  );
  if (mCod) {
    codigo = mCod[1];
    resto = resto.replace(mCod[0], " ");
  }

  // Quantidade grudada na unidade: "3cx", "2 caixas", "10 un", "cx 2"
  const mQtdUnidade =
    resto.match(new RegExp(`\\b(\\d{1,4})\\s*(${UNIT_BOX}|${UNIT_EACH})\\b`, "i")) ??
    resto.match(new RegExp(`\\b(${UNIT_BOX}|${UNIT_EACH})\\s*[:x×]?\\s*(\\d{1,4})\\b`, "i"));
  if (mQtdUnidade) {
    const [, a, b] = mQtdUnidade;
    const num = /^\d+$/.test(a) ? a : b;
    const uni = /^\d+$/.test(a) ? b : a;
    quantidade = Number(num);
    unidade = new RegExp(`^(?:${UNIT_BOX})$`, "i").test(uni) ? "caixa" : "unidade";
    resto = resto.replace(mQtdUnidade[0], " ");
  }

  // "3x pente" / "pente x3"
  if (!quantidade) {
    const mX =
      resto.match(/^(\d{1,4})\s*[x×]\s*/i) ?? resto.match(/[x×]\s*(\d{1,4})\s*$/i);
    if (mX) {
      quantidade = Number(mX[1]);
      resto = resto.replace(mX[0], " ");
    }
  }

  // Números soltos: pode ser código do produto ou a quantidade
  const soltos = [...resto.matchAll(/\b(\d{1,6})\b(?!\s*(?:ml|g|gr|kg|l|lt|cm|mm|%))/gi)]
    .map((m) => m[1])
    .filter((n) => !/^0+$/.test(n));

  const sobra: string[] = [];
  for (const n of soltos) {
    if (!codigo && n.length >= 3 && CODIGOS.has(n)) {
      codigo = n;
      resto = resto.replace(new RegExp(`\\b${n}\\b`), " ");
    } else {
      sobra.push(n);
    }
  }
  if (!quantidade && sobra.length > 0) {
    quantidade = Number(sobra[0]);
    resto = resto.replace(new RegExp(`\\b${sobra[0]}\\b`), " ");
    if (sobra.length > 1) {
      notas.push("mais de um número na linha, confira a quantidade");
    }
  }

  const descricao = resto
    .replace(/[-–—:=|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:de|do|da|dos|das|e)\s+/i, "")
    .replace(/\s+(?:de|do|da|dos|das|e)$/i, "")
    .trim();

  const tokens = tokensUteis(descricao);
  const pareceProduto =
    acertos(tokens, PALAVRAS_BELLIZ) > 0 || acertos(tokens, PALAVRAS_PAYOT) > 0;

  // Sem produto reconhecível e sem código: não é linha de item
  if (!codigo && !ean && !pareceProduto) {
    return {
      item: null,
      observacao: RE_OBS.test(original) ? original.trim() : null,
    };
  }

  if (!quantidade) notas.push("quantidade não informada na mensagem");
  if (!codigo && tokens.length < 2) notas.push("descrição curta, confirme o produto");

  return {
    item: {
      descricao: descricao || original.trim(),
      codigo,
      ean,
      quantidade,
      unidade,
      precoUnitario: preco,
      incerto: notas.length > 0,
      observacao: notas.join(" · "),
    },
    observacao: null,
  };
}

/** Marca com mais palavras batendo com o que foi lido. */
function inferirMarca(texto: string, itens: ExtractedItem[]): string {
  const t = norm(texto);
  if (t.includes("belliz")) return "belliz";
  if (t.includes("payot")) return "payot";

  const tokens = itens.flatMap((i) => tokensUteis(i.descricao));
  const b = acertos(tokens, PALAVRAS_BELLIZ);
  const p = acertos(tokens, PALAVRAS_PAYOT);
  if (b === p) return "";
  return b > p ? "belliz" : "payot";
}

/**
 * Lê o texto de um pedido sem chamar a IA.
 * Devolve no mesmo formato da extração por IA, para reaproveitar todo o resto.
 */
export function parseOrderText(texto: string): LocalParseResult {
  const linhas = (texto ?? "")
    .split(/\r?\n|(?<=[;])\s+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const itens: ExtractedItem[] = [];
  const ignoradas: string[] = [];
  const observacoes: string[] = [];

  for (const linha of linhas) {
    const { item, observacao } = lerLinha(linha);
    if (item) itens.push(item);
    else if (observacao) observacoes.push(observacao);
    else ignoradas.push(linha);
  }

  const ehCabecalho = (l: string) =>
    /^(?:cliente|loja|raz[aã]o social|empresa|cnpj|whats|whatsapp|telefone|tel|fone|contato)\b/i.test(
      l,
    ) || /^[\s\d().\/-]+$/.test(l);

  const cnpj = texto.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/);
  const tel = texto.match(/\(?\b\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/);
  const cliente = texto.match(/(?:cliente|loja|raz[aã]o social|empresa)\s*:\s*(.+)/i);

  const marca = inferirMarca(texto, itens);

  // Um orçamento é de uma marca só: avisa quando a mensagem mistura as duas
  const avisos: string[] = [];
  if (marca) {
    const outra = marca === "belliz" ? PALAVRAS_PAYOT : PALAVRAS_BELLIZ;
    const propria = marca === "belliz" ? PALAVRAS_BELLIZ : PALAVRAS_PAYOT;
    const forasteiros = itens.filter((i) => {
      const t = tokensUteis(i.descricao);
      return acertos(t, outra) > acertos(t, propria);
    }).length;
    if (forasteiros > 0) {
      avisos.push(
        `${forasteiros} item(ns) parecem ser da outra marca. Um orçamento é de uma marca só — separe em dois pedidos.`,
      );
    }
  }

  return {
    order: {
      marca,
      cliente: cliente ? cliente[1].trim().slice(0, 120) : "",
      cnpj: cnpj ? digits(cnpj[0]) : "",
      telefone: tel && digits(tel[0]).length >= 10 ? digits(tel[0]) : "",
      itens,
      observacaoGeral: observacoes.join(" · "),
    },
    ignoradas: ignoradas.filter((l) => !ehCabecalho(l)),
    avisos,
  };
}

/** Só para exibir na tela quantos itens o leitor local achou por marca. */
export function marcaSugerida(res: LocalParseResult): BrandId | null {
  if (res.order.marca === "belliz") return "belliz";
  if (res.order.marca === "payot") return "payot";
  return null;
}
