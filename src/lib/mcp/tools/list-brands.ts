import { defineTool } from "@lovable.dev/mcp-js";

import { BELLIZ, BRANDS, PAYOT } from "@/lib/catalog";

export default defineTool({
  name: "list_brands",
  title: "Listar marcas",
  description: "Lista as marcas representadas e a quantidade de produtos disponíveis em cada catálogo.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify([
          { ...BRANDS.belliz, productCount: BELLIZ.length },
          { ...BRANDS.payot, productCount: PAYOT.length },
        ]),
      },
    ],
    structuredContent: {
      brands: [
        { ...BRANDS.belliz, productCount: BELLIZ.length },
        { ...BRANDS.payot, productCount: PAYOT.length },
      ],
    },
  }),
});