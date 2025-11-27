// @ts-check

import esbuild from 'esbuild';

await esbuild.build({
  bundle: true,
  minify: true,
  entryPoints: ['./src/index.ts'],
  outdir: './built',
  platform: 'node',
  format: 'esm',
  packages: 'external',
  banner: {
    js: '// @ts-nocheck\nimport { createRequire } from "node:module"; import url from "node:url"; const require = createRequire(import.meta.url); const __filename = url.fileURLToPath(import.meta.url); const __dirname = url.fileURLToPath(new URL(".", import.meta.url));',
  },
});
