import { defineConfig } from "vite";
import { builtinModules } from "node:module";

// Electron main + preload, bundled to CommonJS in dist-electron/.
export default defineConfig({
  build: {
    outDir: "dist-electron",
    emptyOutDir: true,
    target: "node22",
    minify: false,
    sourcemap: true,
    lib: {
      entry: { main: "src/main/main.ts", preload: "src/preload/preload.ts" },
      formats: ["cjs"],
      fileName: (_fmt, name) => `${name}.cjs`,
    },
    rollupOptions: {
      external: ["electron", ...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
    },
  },
});
