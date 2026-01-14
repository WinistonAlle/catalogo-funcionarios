import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",   // permite acesso local e externo
    port: 4174,        // 🔒 porta fixa
    strictPort: true,  // ❌ não deixa o Vite trocar de porta
    allowedHosts: [
    "funcionarios.gostinhomineiro.com"
    ],
  },
  plugins: [
    react(),
    mode === "production" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));