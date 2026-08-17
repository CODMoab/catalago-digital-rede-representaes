export type CustomerProfile = {
  name: string;
  phone: string;
  cnpj: string;
  discountPercent: number;
  registeredAt: string;
  spunRoulette: boolean;
};

const STORAGE_KEY = "rede_representacoes_customer_v1";
export const DEFAULT_DISCOUNT_PERCENT = 15;

export function getLocalCustomer(): CustomerProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerProfile;
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
