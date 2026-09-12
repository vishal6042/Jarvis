import { readFileSync } from "fs";
import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as {
  version: string;
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Baked in at build time so Settings can say which build is being looked at. The version alone
  // does not distinguish two builds of the same release, which is exactly when someone asks.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // host: true binds to 0.0.0.0 so a phone/tablet on the same Wi-Fi can open http://<PC-IP>:5173
  server: { host: true, port: 5173 },
});
