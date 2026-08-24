/**
 * Conferência do CNPJ do lead.
 *
 * Duas camadas, da mais barata para a mais cara:
 *   1. dígito verificador — pega erro de digitação sem sair do navegador;
 *   2. consulta à Receita — diz se a empresa existe e se está ativa.
 *
 * A classificação de ramo serve para etiquetar o lead, nunca para barrar: a
 * própria ficha da Payot aceita perfumaria, farmácia, e-commerce e supermercado,
 * e CNAE desatualizado é comum em loja pequena.
 */
export const ESTADO_ATENDIDO = "BA";

export type PerfilLead =
  | "perfumaria"
  | "farmacia"
  | "supermercado"
  | "atacado"
  | "ecommerce"
  | "salao"
  | "estetica"
  | "varejo"
  | "outro";

export const PERFIS: Record<PerfilLead, { label: string; combina: boolean; nota: string }> = {
  perfumaria: { label: "Perfumaria / Cosméticos", combina: true, nota: "Perfil direto do nosso mix." },
  farmacia: { label: "Farmácia / Drogaria", combina: true, nota: "A Payot atende esse canal." },
  supermercado: { label: "Supermercado / Mercearia", combina: true, nota: "Canal aceito pelas indústrias." },
  atacado: { label: "Atacado / Distribuidor", combina: true, nota: "Pode entrar na tabela de atacado." },
  ecommerce: { label: "E-commerce", combina: true, nota: "Canal que consta na ficha das indústrias." },
  salao: { label: "Salão / Barbearia", combina: true, nota: "Compra, mas com mix diferente do varejo." },
  estetica: { label: "Estética / Clínica", combina: true, nota: "Compra, mas com mix diferente do varejo." },
  varejo: { label: "Varejo em geral", combina: true, nota: "Confirmar o que a loja vende." },
  outro: { label: "Fora do ramo", combina: false, nota: "CNAE distante do nosso mix — conferir antes de investir tempo." },
};

/** CNAEs que aparecem com frequência na base; o resto cai no texto. */
const POR_CODIGO: Record<string, PerfilLead> = {
  "4772500": "perfumaria",
  "4771701": "farmacia",
  "4771702": "farmacia",
  "4771703": "farmacia",
  "4711301": "supermercado",
  "4711302": "supermercado",
  "4712100": "supermercado",
  "4646001": "atacado",
  "4646002": "atacado",
  "4649408": "atacado",
  "9602501": "salao",
  "9602502": "estetica",
  "4713002": "varejo",
  "4713004": "varejo",
  "4789001": "varejo",
  "4791300": "ecommerce",
  "4792800": "ecommerce",
};

/**
 * Ramos que não compram do nosso mix.
 *
 * Conferido antes da regra genérica de varejo, senão "comércio varejista de
 * materiais de construção" entraria como loja só por ter a palavra "varejista".
 */
const FORA_DO_RAMO =
  /constru[çc][ãa]o|material de constru|ferragem|ferramenta|combust[íi]vel|autope[çc]a|ve[íi]culo|software|programa de computador|inform[áa]tica|tecnologia da informa|consultoria|advocat|jur[íi]dic|contabil|engenharia|arquitetur|transporte|log[íi]stica|imobili[áa]r|constru[çc][õo]es|seguran[çc]a privada|banc|seguro|educa[çc][ãa]o|ensino|hospital|cl[íi]nica m[ée]dica|restaurante|lanchonete|agr[íi]cola|pecu[áa]r/i;

/** Os ramos que compram, do mais específico para o mais genérico. */
const POR_TEXTO: [RegExp, PerfilLead][] = [
  [/perfumaria|cosm[eé]tic|higiene pessoal|beleza/i, "perfumaria"],
  [/farmac[eê]utic|drogaria|medicament|farm[áa]cia/i, "farmacia"],
  [/supermercado|hipermercado|minimercado|mercearia|armaz[ée]m|mercado/i, "supermercado"],
  [/atacadista|distribui/i, "atacado"],
  [/internet|cat[áa]logo|correspond[êe]ncia|com[ée]rcio eletr[ôo]nico|e-?commerce/i, "ecommerce"],
  [/cabeleireiro|manicure|pedicure|barbear|barbearia/i, "salao"],
  [/est[eé]tica|embelezamento/i, "estetica"],
  // Rede genérica: loja de bairro costuma ter CNAE vago, e vende de tudo
  [/varejista|com[eé]rcio varejista|loja de departament|armarinho|bijuteria|presente|vestu[áa]rio/i, "varejo"],
];

export function classificarCnae(codigo: string, descricao: string): PerfilLead {
  const limpo = (codigo || "").replace(/\D/g, "");
  const direto = POR_CODIGO[limpo];
  if (direto) return direto;

  const texto = descricao || "";
  for (const [re, perfil] of POR_TEXTO) {
    if (!re.test(texto)) continue;
    // "Comércio varejista de material de construção" bate em varejista, mas não
    // é loja do nosso mix: o ramo excluído tem a palavra final.
    if (perfil === "varejo" && FORA_DO_RAMO.test(texto)) return "outro";
    return perfil;
  }
  return FORA_DO_RAMO.test(texto) ? "outro" : "outro";
}

/** Dígito verificador do CNPJ: pega erro de digitação antes de qualquer consulta. */
export function cnpjValido(valor: string): boolean {
  const c = (valor || "").replace(/\D/g, "");
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const digito = (base: string) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i += 1) {
      soma += Number(base[i]) * peso;
      peso -= 1;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(c.slice(0, 12)) === Number(c[12]) && digito(c.slice(0, 13)) === Number(c[13]);
}

export type SituacaoCnpj = "ativa" | "baixada" | "suspensa" | "inapta" | "nula" | "desconhecida";

export type ConsultaCnpj = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: SituacaoCnpj;
  situacaoTexto: string;
  desde: string;
  abertura: string;
  cnae: string;
  cnaeDescricao: string;
  perfil: PerfilLead;
  endereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
  porte: string;
  simples: boolean;
  mei: boolean;
};

/** O que impede o pedido de fechar, e o que só merece um aviso. */
export type Veredito = {
  bloqueia: boolean;
  avisos: string[];
  titulo: string;
};

export function avaliarCnpj(c: ConsultaCnpj): Veredito {
  const avisos: string[] = [];
  let bloqueia = false;
  let titulo = "CNPJ ativo na Receita Federal.";

  if (c.situacao === "baixada" || c.situacao === "nula") {
    bloqueia = true;
    titulo = `Essa empresa está ${c.situacaoTexto.toLowerCase()} na Receita Federal.`;
    avisos.push("Pedido com CNPJ baixado não passa no faturamento da indústria.");
  } else if (c.situacao === "suspensa" || c.situacao === "inapta") {
    titulo = `Essa empresa está ${c.situacaoTexto.toLowerCase()} na Receita Federal.`;
    avisos.push("Vale conferir com o cliente antes de montar o pedido.");
  }

  if (c.uf && c.uf !== ESTADO_ATENDIDO) {
    avisos.push(`A empresa está registrada em ${c.uf} — a representação atende a Bahia.`);
  }

  if (!PERFIS[c.perfil].combina) avisos.push(PERFIS[c.perfil].nota);

  return { bloqueia, avisos, titulo };
}
