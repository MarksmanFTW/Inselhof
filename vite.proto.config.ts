import { defineConfig } from 'vite';

// 3D-Probeentwurf (eigene Seite, getrennt vom Spiel)
export default defineConfig({
  root: 'proto3d',
  base: './',
  build: { outDir: '../dist-proto', emptyOutDir: true },
});
