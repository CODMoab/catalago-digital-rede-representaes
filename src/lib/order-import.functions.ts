import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** O que a IA devolve por item lido — ainda sem casar com o catálogo. */
const extractedItemSchema = z.object({
  descricao: z.string().describe("Como o item aparece no pedido, texto cru"),
  codigo: z.string().describe("Código do produto, se aparecer. Vazio se não houver."),
  ean: z.string().describe("EAN/código de barras, se aparecer. Vazio se não houver."),
  quantidade: z.number().describe("Quantidade pedida. Use 0 se não der para saber."),
  unidade: z
    .string()
    .describe("Unidade citada: 'unidade', 'caixa', 'coletivo', 'display' ou vazio"),
  precoUnitario: z
    .number()
    .describe("Preço unitário citado no pedido. Use 0 se não houver preço."),
  incerto: z
    .boolean()
    .describe("true quando a leitura deste item ficou ambígua, ilegível ou incompleta"),
  observacao: z
    .string()
    .describe("Se incerto, explique em uma frase curta o que ficou em dúvida"),
});

const extractionSchema = z.object({
  marca: z
    .string()
    .describe("'belliz', 'payot' ou vazio se não der para identificar a marca"),
  cliente: z.string().describe("Nome da loja/cliente, se aparecer. Vazio se não houver."),
  cnpj: z.string().describe("CNPJ do cliente, só dígitos. Vazio se não houver."),
  telefone: z.string().describe("Telefone do cliente, só dígitos. Vazio se não houver."),
  itens: z.array(extractedItemSchema),
  observacaoGeral: z
    .string()
    .describe("Qualquer condição ou recado relevante do pedido (prazo, frete, desconto)"),
});

export type ExtractedOrder = z.infer<typeof extractionSchema>;

const SYSTEM = `Você extrai pedidos de compra de lojistas para uma representação comercial
das marcas Belliz (acessórios de beleza, vendidos por embalagem coletiva) e Payot
(skincare e maquiagem, vendidos por unidade).

O pedido pode chegar como texto de WhatsApp, PDF, foto de papel ou print de tela.
Regras:
- Extraia SOMENTE o que está escrito. Nunca invente produto, quantidade ou preço.
- Quando um item estiver ilegível, ambíguo, sem quantidade clara ou com quantidade
  duvidosa, marque incerto=true e explique em observacao o que ficou em dúvida.
- Quantidade escrita como "2cx", "3 displays", "1 coletivo" deve ir em quantidade com a
  unidade correspondente em unidade.
- Campos que não aparecem no documento ficam vazios (string) ou 0 (número).
- É melhor marcar incerto do que chutar.`;

/** Schema estrito da extração — o modelo é obrigado a responder nesse formato. */
const EXTRACTION_TOOL = {
  name: "registrar_pedido",
  description: "Registra o pedido extraído do documento.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      marca: { type: "string", description: "'belliz', 'payot' ou vazio" },
      cliente: { type: "string", description: "Nome da loja/cliente ou vazio" },
      cnpj: { type: "string", description: "CNPJ do cliente, só dígitos, ou vazio" },
      telefone: { type: "string", description: "Telefone do cliente, só dígitos, ou vazio" },
      observacaoGeral: {
        type: "string",
        description: "Condições ou recados do pedido (prazo, frete, desconto) ou vazio",
      },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descricao: { type: "string", description: "O item como aparece no pedido" },
            codigo: { type: "string", description: "Código do produto ou vazio" },
            ean: { type: "string", description: "EAN/código de barras ou vazio" },
            quantidade: { type: "number", description: "Quantidade pedida, 0 se ilegível" },
            unidade: {
              type: "string",
              description: "'unidade', 'caixa', 'coletivo', 'display' ou vazio",
            },
            precoUnitario: { type: "number", description: "Preço unitário citado ou 0" },
            incerto: { type: "boolean", description: "true se a leitura ficou ambígua" },
            observacao: { type: "string", description: "O que ficou em dúvida, ou vazio" },
          },
          required: [
            "descricao","codigo","ean","quantidade","unidade","precoUnitario","incerto","observacao",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["marca", "cliente", "cnpj", "telefone", "observacaoGeral", "itens"],
    additionalProperties: false,
  },
};

const inputSchema = z.object({
  text: z.string().max(30000).default(""),
  file: z
    .object({
      base64: z.string().max(20_000_000),
      mediaType: z.string().max(100),
    })
    .nullable()
    .default(null),
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!data) throw new Error("Acesso restrito ao administrador.");
}

/**
 * Lê um pedido recebido em texto, PDF ou imagem e devolve os itens estruturados.
 * O casamento com o catálogo é feito depois, no navegador, com os preços atuais.
 */
export const parseOrderDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return {
        ok: false as const,
        error:
          "A chave da IA não está configurada. Adicione ANTHROPIC_API_KEY nos Secrets do Lovable Cloud.",
        order: null,
      };
    }

    if (!data.text.trim() && !data.file) {
      return {
        ok: false as const,
        error: "Cole o texto do pedido ou envie um arquivo.",
        order: null,
      };
    }

    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey });

      const content: any[] = [];
      if (data.file) {
        const isPdf = data.file.mediaType === "application/pdf";
        content.push(
          isPdf
            ? {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: data.file.base64,
                },
              }
            : {
                type: "image",
                source: {
                  type: "base64",
                  media_type: data.file.mediaType,
                  data: data.file.base64,
                },
              },
        );
      }
      content.push({
        type: "text",
        text: data.text.trim()
          ? `Extraia o pedido abaixo:

${data.text.trim()}`
          : "Extraia o pedido do arquivo anexado.",
      });

      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 16000,
        system: SYSTEM,
        thinking: { type: "adaptive" },
        messages: [{ role: "user", content }],
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: "registrar_pedido" },
      });

      if (response.stop_reason === "refusal") {
        return {
          ok: false as const,
          error: "A IA não conseguiu processar este documento. Tente lançar à mão.",
          order: null,
        };
      }

      const toolUse = response.content.find((b) => b.type === "tool_use");
      const parsed = toolUse
        ? extractionSchema.safeParse((toolUse as { input: unknown }).input)
        : null;
      const order = parsed?.success ? parsed.data : null;

      if (!order) {
        return {
          ok: false as const,
          error: "Não consegui interpretar este pedido. Tente colar o texto.",
          order: null,
        };
      }

      return { ok: true as const, error: null, order };
    } catch (err: any) {
      console.error("[order-import] Falha ao ler pedido:", err?.message);
      return {
        ok: false as const,
        error: `Erro ao consultar a IA: ${err?.message ?? "desconhecido"}`,
        order: null,
      };
    }
  });
