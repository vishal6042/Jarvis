import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              // Native/optional deps stay external so they are required at runtime from
              // node_modules rather than bundled and broken.
              external: ["systeminformation", "electron"],
              output: { format: "es", entryFileNames: "main.js" },
            },
          },
        },
      },
      preload: {
        input: "electron/preload.ts",
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              external: ["electron"],
              // CommonJS on purpose: the preload runs sandboxed, and a sandboxed preload cannot
              // be an ES module. Keeping it .cjs avoids turning the sandbox off to satisfy a
              // module format nothing here needs.
              output: { format: "cjs", entryFileNames: "preload.cjs" },
            },
          },
        },
      },
    }),
  ],
  build: { outDir: "dist", emptyOutDir: true },
  server: { port: 5199, strictPort: true },
});
