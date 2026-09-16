import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    solid(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/pdfjs-viewer-element/dist/*.mjs', dest: 'assets', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-viewer-element/dist/*.css', dest: 'assets', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-viewer-element/dist/images/*', dest: 'assets/images', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-dist/cmaps/*', dest: 'pdfjs/cmaps', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-dist/iccs/*', dest: 'pdfjs/iccs', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-dist/standard_fonts/*', dest: 'pdfjs/standard_fonts', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-dist/wasm/*', dest: 'pdfjs/wasm', rename: { stripBase: true } },
        { src: 'node_modules/pdfjs-dist/build/pdf.sandbox.mjs', dest: 'pdfjs/build', rename: { stripBase: true } },
      ],
    }),
  ],
  optimizeDeps: { exclude: ['pdfjs-viewer-element'] },
  server: { port: 1420, strictPort: true },
  test: { environment: 'node', css: true },
});
