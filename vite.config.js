import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

export default defineConfig({
  // GitHub Pages serves project sites from /<repo-name>/, so the deploy
  // workflow sets VITE_BASE. Local dev and preview keep the root path.
  base: process.env.VITE_BASE || '/',
  plugins: [
    vue(),
    // Auto-imports only the Vuetify components the app actually uses.
    vuetify({ autoImport: true }),
  ],
  server: { port: 5173 },
})
