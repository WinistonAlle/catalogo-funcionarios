import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 4174,
    strictPort: true,
    allowedHosts: ["funcionarios.gostinhomineiro.com"],
    proxy: {
      "/automation": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/automation/, ""),
      },
      "/api": {
        target: "http://127.0.0.1:3333",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },

  plugins: [
    react(),

    // PWA
    VitePWA({
      // ✅ injeta o registro automaticamente (sem precisar mexer no main.tsx)
      injectRegister: "auto",
      registerType: "autoUpdate",

      // ✅ se quiser que funcione também no npm run dev
      devOptions: { enabled: true },

      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Catálogo de Funcionários",
        short_name: "Catálogo",
        description: "Sistema interno de pedidos e painéis",
        theme_color: "#9E0F14",
        background_color: "#9E0F14",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-512x512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "/index.html",
        // Recarrega as abas presas no bundle antigo. Ver public/sw-auto-reload.js.
        importScripts: ["/sw-auto-reload.js"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname.includes("supabase") ||
              url.pathname.startsWith("/rest/") ||
              url.pathname.startsWith("/auth/") ||
              url.pathname.startsWith("/storage/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),

    mode === "production" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Os testes cobrem lógica pura (preço, estoque, resposta do CIGAM), então
  // rodam em Node mesmo — não precisam de DOM. `automation/` fica de fora do
  // tsconfig do app, mas o vitest o alcança normalmente.
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "automation/**/*.test.ts", "scripts/**/*.test.ts"],
  },
}));
