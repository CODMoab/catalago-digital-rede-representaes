export type CustomerProfile = {
  name: string;
  phone: string;
  cnpj: string;
  city: string;
  state: string;
  discountPercent: number;
  registeredAt: string;
  spunRoulette: boolean;
};

const STORAGE_KEY = "rede_representacoes_customer_v1";
export const DEFAULT_DISCOUNT_PERCENT = 15;

/** Única UF atendida pela representação. */
export const SERVED_STATE = "BA";
export const SERVED_STATE_NAME = "Bahia";
export const COVERAGE_NOTICE =
  "Atendemos exclusivamente parceiros com CNPJ sediado na Bahia (BA).";

/** UFs do Brasil para o cadastro (usado para filtrar quem está fora da área). */
export const BR_STATES: { uf: string; name: string }[] = [
  { uf: "BA", name: "Bahia" },
  { uf: "AC", name: "Acre" },
  { uf: "AL", name: "Alagoas" },
  { uf: "AP", name: "Amapá" },
  { uf: "AM", name: "Amazonas" },
  { uf: "CE", name: "Ceará" },
  { uf: "DF", name: "Distrito Federal" },
  { uf: "ES", name: "Espírito Santo" },
  { uf: "GO", name: "Goiás" },
  { uf: "MA", name: "Maranhão" },
  { uf: "MT", name: "Mato Grosso" },
  { uf: "MS", name: "Mato Grosso do Sul" },
  { uf: "MG", name: "Minas Gerais" },
  { uf: "PA", name: "Pará" },
  { uf: "PB", name: "Paraíba" },
  { uf: "PR", name: "Paraná" },
  { uf: "PE", name: "Pernambuco" },
  { uf: "PI", name: "Piauí" },
  { uf: "RJ", name: "Rio de Janeiro" },
  { uf: "RN", name: "Rio Grande do Norte" },
  { uf: "RS", name: "Rio Grande do Sul" },
  { uf: "RO", name: "Rondônia" },
  { uf: "RR", name: "Roraima" },
  { uf: "SC", name: "Santa Catarina" },
  { uf: "SP", name: "São Paulo" },
  { uf: "SE", name: "Sergipe" },
  { uf: "TO", name: "Tocantins" },
];

/** Principais cidades da Bahia — apenas sugestão de digitação (datalist). */
export const BA_CITIES: string[] = [
  "Salvador",
  "Feira de Santana",
  "Vitória da Conquista",
  "Camaçari",
  "Juazeiro",
  "Itabuna",
  "Lauro de Freitas",
  "Ilhéus",
  "Jequié",
  "Teixeira de Freitas",
  "Barreiras",
  "Alagoinhas",
  "Porto Seguro",
  "Simões Filho",
  "Paulo Afonso",
  "Eunápolis",
  "Santo Antônio de Jesus",
  "Valença",
  "Candeias",
  "Guanambi",
  "Jacobina",
  "Serrinha",
  "Senhor do Bonfim",
  "Dias d'Ávila",
  "Luís Eduardo Magalhães",
  "Irecê",
  "Bom Jesus da Lapa",
  "Brumado",
  "Itapetinga",
  "Cruz das Almas",
  "Casa Nova",
  "Campo Formoso",
  "Itamaraju",
  "Ribeira do Pombal",
  "Conceição do Coité",
  "Santa Maria da Vitória",
  "Euclides da Cunha",
  "Ipirá",
  "Mata de São João",
  "Xique-Xique",
];

export function getLocalCustomer(): CustomerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomerProfile>;
    // Cadastros antigos não tinham cidade/estado — normaliza para não quebrar a tela.
    return {
      ...parsed,
      city: parsed.city ?? "",
      state: parsed.state ?? SERVED_STATE,
    } as CustomerProfile;
  } catch {
    return null;
  }
}

export function saveLocalCustomer(profile: CustomerProfile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error("Erro ao salvar perfil do cliente localmente", e);
  }
}

export function clearLocalCustomer(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.error("Erro ao limpar perfil do cliente", e);
  }
}

export function onlyDigits(str: string): string {
  return str.replace(/\D/g, "");
}

export function formatCnpj(val: string): string {
  const d = onlyDigits(val).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatPhone(val: string): string {
  const d = onlyDigits(val).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/** Calcula o valor com desconto arredondado para 2 casas decimais. */
export function getDiscountedPrice(price: number, discountPercent: number = DEFAULT_DISCOUNT_PERCENT): number {
  if (!discountPercent || discountPercent <= 0) return price;
  const factor = (100 - discountPercent) / 100;
  return Math.round(price * factor * 100) / 100;
}
