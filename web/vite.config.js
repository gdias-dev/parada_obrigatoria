import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Em desenvolvimento, /api vai para o servidor PHP local (php -S 127.0.0.1:8000 index.php)
  server: {
    host: true, // permite testar pelo celular na mesma rede
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 800 },
})
