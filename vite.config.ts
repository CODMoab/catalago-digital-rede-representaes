// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// O mcpPlugin quebra no Windows: ele compara o caminho do projeto vindo do Vite
// ("C:/Users/...", com barra normal) contra o que ele mesmo monta
// ("C:\Users\...", com barra invertida) e conclui, errado, que sao pastas diferentes.
// No Lovable e em Mac/Linux nao ha esse conflito, entao ali o plugin segue ligado.
const isWindows = process.platform === "win32";

export default defineConfig({
  vite: {
    plugins: isWindows ? [] : [mcpPlugin()],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
