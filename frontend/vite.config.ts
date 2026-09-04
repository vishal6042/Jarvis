import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // host: true binds to 0.0.0.0 so a phone/tablet on the same Wi-Fi can open http://<PC-IP>:5173
  server: { host: true, port: 5173 },
});
