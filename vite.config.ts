import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    ssr: true,
    rollupOptions: {
      input: 'src/index.tsx',
      output: {
        entryFileNames: '_worker.js'
      }
    }
  }
})