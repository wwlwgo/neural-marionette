import {defineConfig} from 'vite';
export default defineConfig({
  server:{host:'127.0.0.1'},
  preview:{host:'127.0.0.1'},
  // Preserve previous outputs rather than performing destructive cleanup.
  build:{emptyOutDir:false,rollupOptions:{output:{manualChunks:{three:['three']}}}}
});
