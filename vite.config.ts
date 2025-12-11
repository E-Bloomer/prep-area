import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon-16.png",
        "icons/favicon-32.png",
        "icons/apple-touch-icon.png",
        "icons/icon-32.png",
        "icons/icon-48.png",
        "icons/icon-64.png",
        "icons/icon-72.png",
        "icons/icon-96.png",
        "icons/icon-128.png",
        "icons/icon-192.png",
        "icons/icon-192-maskable.png",
        "icons/icon-256.png",
        "icons/icon-512.png",
        "icons/icon-512-maskable.png",
        "icons/icon-1024.png"
      ],
      additionalManifestEntries: [
        { url: "content.sqlite", revision: null },
        { url: "sql-wasm.wasm", revision: null }
      ],
      manifest: {
        name: "Prep Area",
        short_name: "Prep Area",
        description: "Offline Dice Masters collection tracker.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0f172a",
        icons: [
          {
            src: "/icons/icon-32.png",
            sizes: "32x32",
            type: "image/png"
          },
          {
            src: "/icons/icon-48.png",
            sizes: "48x48",
            type: "image/png"
          },
          {
            src: "/icons/icon-64.png",
            sizes: "64x64",
            type: "image/png"
          },
          {
            src: "/icons/icon-72.png",
            sizes: "72x72",
            type: "image/png"
          },
          {
            src: "/icons/icon-96.png",
            sizes: "96x96",
            type: "image/png"
          },
          {
            src: "/icons/icon-128.png",
            sizes: "128x128",
            type: "image/png"
          },
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-192-maskable.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icons/icon-256.png",
            sizes: "256x256",
            type: "image/png"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icons/icon-1024.png",
            sizes: "1024x1024",
            type: "image/png"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,wasm,json}"],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".sqlite"),
            handler: "CacheFirst",
            options: {
              cacheName: "sqlite-cache",
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith(".wasm"),
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-cache",
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/images/"),
            handler: "CacheFirst",
            options: {
              cacheName: "card-images-v1",
              expiration: {
                maxEntries: 3000,
                maxAgeSeconds: 60 * 60 * 24 * 180
              },
              cacheableResponse: {
                statuses: [200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "google-fonts-stylesheets"
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: "0.0.0.0",   // listen on all IPv4 interfaces (avoid ::1)
    port: 5173,
    strictPort: true,
    hmr: {
      host: "localhost",
      port: 5173
    }
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true
  }
});
