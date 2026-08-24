/**
 * Guarda o Talão de Pedidos da Belliz no navegador.
 *
 * O talão é o modelo oficial da indústria e tem quase 3 MB — grande demais para
 * o localStorage, então mora no IndexedDB. A ideia é escolher o arquivo do mês
 * uma vez e não escolher de novo: depois disso é só clicar e baixar preenchido.
 */
const BANCO = "rede-representacoes";
const LOJA = "modelos";
const CHAVE_TALAO = "talao-belliz";

export type TalaoGuardado = {
  nome: string;
  tamanho: number;
  guardadoEm: string;
  arquivo: ArrayBuffer;
};

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, falha) => {
    if (typeof indexedDB === "undefined") {
      falha(new Error("Este navegador não guarda arquivos."));
      return;
    }
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOJA)) req.result.createObjectStore(LOJA);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error ?? new Error("Não consegui abrir o armazenamento."));
  });
}

function transacao<T>(modo: IDBTransactionMode, acao: (loja: IDBObjectStore) => IDBRequest<T>) {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, falha) => {
        const req = acao(db.transaction(LOJA, modo).objectStore(LOJA));
        req.onsuccess = () => ok(req.result);
        req.onerror = () => falha(req.error ?? new Error("Falhou ao acessar o armazenamento."));
      }),
  );
}

export async function guardarTalao(arquivo: File): Promise<TalaoGuardado> {
  const registro: TalaoGuardado = {
    nome: arquivo.name,
    tamanho: arquivo.size,
    guardadoEm: new Date().toISOString(),
    arquivo: await arquivo.arrayBuffer(),
  };
  await transacao("readwrite", (loja) => loja.put(registro, CHAVE_TALAO));
  return registro;
}

export async function lerTalao(): Promise<TalaoGuardado | null> {
  try {
    const r = await transacao<TalaoGuardado | undefined>("readonly", (loja) =>
      loja.get(CHAVE_TALAO),
    );
    return r?.arquivo ? r : null;
  } catch {
    return null;
  }
}

export async function esquecerTalao(): Promise<void> {
  try {
    await transacao("readwrite", (loja) => loja.delete(CHAVE_TALAO));
  } catch {
    /* nada guardado */
  }
}
