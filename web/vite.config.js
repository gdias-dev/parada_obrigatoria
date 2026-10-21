import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const VERSAO = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

// Carimba a versão no sw.js gerado, para o app perceber quando sobe uma versão nova
const carimbarVersao = () => ({
  name: 'carimbar-versao',
  apply: 'build',
  closeBundle() {
    const f = 'dist/sw.js'
    if (existsSync(f)) writeFileSync(f, readFileSync(f, 'utf8').replaceAll('__VERSAO__', VERSAO))
  },
})

export default defineConfig({
  plugins: [react(), carimbarVersao()],
  define: { __VERSAO_APP__: JSON.stringify(VERSAO) },
  // Em desenvolvimento, /api vai para o servidor PHP local (php -S 127.0.0.1:8000 index.php)
  server: {
    host: true, // permite testar pelo celular na mesma rede
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 800 },
})
