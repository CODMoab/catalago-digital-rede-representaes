/**
 * Conserto da resposta da IA antes de validar.
 *
 * O modelo as vezes devolve a lista de itens como texto dentro de outro campo,
 * junto com restos do formato interno dele. Em vez de perder uma leitura que
 * estava correta, a gente resgata a lista e limpa os campos de texto.
 */
/** Restos do formato interno do modelo que as vezes vazam como texto. */
const MARCAS_ARTEFATO = ["</antml", "<antml", "<parameter name=", "</parameter>"];

export function limpaTexto(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (!s) return "";
  let corte = s.length;
  for (const m of MARCAS_ARTEFATO) {
    const i = s.indexOf(m);
    if (i >= 0 && i < corte) corte = i;
  }
  return s.slice(0, corte).trim();
}

/**
 * Resgata a lista de itens quando o modelo a devolve como texto dentro de outro
 * campo em vez de preencher itens. Acontece de vez em quando com pedidos longos.
 */
export function resgataItens(raw: Record<string, unknown>): unknown[] | null {
  for (const valor of Object.values(raw)) {
    if (typeof valor !== "string") continue;
    const ini = valor.indexOf("[{");
    const fim = valor.lastIndexOf("}]");
    if (ini < 0 || fim <= ini) continue;
    try {
      const arr = JSON.parse(valor.slice(ini, fim + 2));
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {
      // formato quebrado: segue tentando nos outros campos
    }
  }
  return null;
}

/** Conserta o que der antes de validar, para não perder uma leitura boa. */
export function normalizaExtracao(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const raw = { ...(input as Record<string, unknown>) };

  const itens = raw["itens"];
  if (!Array.isArray(itens) || itens.length === 0) {
    const resgatados = resgataItens(raw);
    if (resgatados) raw["itens"] = resgatados;
  }

  for (const campo of ["cliente", "cnpj", "telefone", "observacaoGeral"]) {
    raw[campo] = limpaTexto(raw[campo]);
  }

  if (Array.isArray(raw["itens"])) {
    raw["itens"] = (raw["itens"] as unknown[]).map((i) => ({
      descricao: "",
      codigo: "",
      ean: "",
      quantidade: 0,
      unidade: "",
      precoUnitario: 0,
      incerto: false,
      observacao: "",
      ...(i && typeof i === "object" ? (i as Record<string, unknown>) : {}),
    }));
  }

  return raw;
}

