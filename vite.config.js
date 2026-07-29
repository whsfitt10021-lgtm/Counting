import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Apps Script HtmlService serves a single HTML file per "page" (index.html),
// and does not serve a /assets/*.js directory the way a normal static host
// would. vite-plugin-singlefile inlines the built JS/CSS directly into the
// HTML output so the whole app is one self-contained file - exactly what
// HtmlService.createHtmlOutputFromFile('index') expects.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020', // Apps Script's iframe and modern Netlify browsers support this baseline.
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
