import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages のサブパス対応。
// 例) リポジトリ名が tsume-shogi-note → base は "/tsume-shogi-note/"
// GitHub Actions では BASE_PATH をリポジトリ名から自動設定します。
const base = process.env.BASE_PATH || "/tsume-shogi-note/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "詰将棋ノート",
        short_name: "詰将棋",
        description: "詰将棋の入力・データベース・閲覧・脳内将棋トレーニング",
        lang: "ja",
        dir: "ltr",
        theme_color: "#b1442f",
        background_color: "#f3ecdd",
        display: "standalone",
        orientation: "portrait",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest}"]
      }
    })
  ]
});
