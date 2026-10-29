import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
const compressedMockupMaps: Plugin = {
  name: "prepared-mockup-brotli",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (
        /^\/product-assets\/mockup-scenes\/tin-can-r1\/(body|lid)\.uv\.bin\.br(?:\?|$)/.test(
          req.url || "",
        )
      ) {
        res.setHeader("Content-Encoding", "br");
        res.setHeader("Content-Type", "application/octet-stream");
      }
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (
        /^\/product-assets\/mockup-scenes\/tin-can-r1\/(body|lid)\.uv\.bin\.br(?:\?|$)/.test(
          req.url || "",
        )
      ) {
        res.setHeader("Content-Encoding", "br");
        res.setHeader("Content-Type", "application/octet-stream");
      }
      next();
    });
  },
};
export default defineConfig({
  plugins: [react(), compressedMockupMaps],
  base: "./",
  build: {
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        page: "index.html",
        demo: "launcher-demo.html",
        mockupDemo: "mockup-demo.html",
        handCupDemo: "hand-cup-demo.html",
        tinCanDemo: "tin-can-demo.html",
        editor: "src/main.tsx",
        launcher: "src/launcher.ts",
      },
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: "alacam-[name].js",
        chunkFileNames: "alacam-[name]-[hash].js",
        assetFileNames: "alacam-[name].[ext]",
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
});
