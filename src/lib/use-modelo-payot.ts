import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { getSetting, setSetting } from "@/lib/settings.functions";
import {
  CHAVE_MODELO_PAYOT,
  hidrataModeloPayot,
  salvarModeloPayot,
  type ModeloPayot,
} from "@/lib/modelo-payot";

/**
 * Mantém o mapa da tabela da Payot igual em todos os aparelhos.
 *
 * Ao abrir o painel, busca o mapa no banco e guarda na memória e no navegador.
 * Ao importar uma tabela nova, publica o mapa no banco — assim quem importa no
 * notebook não precisa repetir no celular.
 */
export type StatusModelo =
  | "carregando"
  /** O mapa em uso é o que está no banco. */
  | "sincronizado"
  /** O banco ainda não tem mapa nenhum: vale o do navegador ou o do código. */
  | "sem-mapa"
  /** Não deu para falar com o banco (tabela ausente ou sem rede). */
  | "offline";

export function useModeloPayot() {
  const [status, setStatus] = useState<StatusModelo>("carregando");
  const ler = useServerFn(getSetting);
  const gravar = useServerFn(setSetting);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await ler({ data: { key: CHAVE_MODELO_PAYOT } });
        if (!vivo) return;
        if (!res.disponivel) {
          setStatus("offline");
          return;
        }
        if (res.valueJson && hidrataModeloPayot(JSON.parse(res.valueJson))) {
          setStatus("sincronizado");
          return;
        }
        setStatus("sem-mapa");
      } catch {
        if (vivo) setStatus("offline");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [ler]);

  /** Publica o mapa novo. Devolve false quando só deu para salvar localmente. */
  const publicar = useCallback(
    async (modelo: ModeloPayot): Promise<boolean> => {
      try {
        await gravar({
          data: { key: CHAVE_MODELO_PAYOT, valueJson: JSON.stringify(modelo) },
        });
        salvarModeloPayot(modelo, true);
        setStatus("sincronizado");
        return true;
      } catch {
        salvarModeloPayot(modelo, false);
        setStatus("offline");
        return false;
      }
    },
    [gravar],
  );

  return { status, publicar };
}
