import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await build({
  entryPoints: ['src/api-entry.ts'],
  platform: 'node',
  bundle: true,
  format: 'esm',
  outfile: 'api/index.js',
  external: ['express'],
  packages: 'external',  // THIS IS THE KEY - externalize ALL node_modules
  platform: 'node',
  format: 'esm',
  target: 'node20',
}).catch(() => process.exit(1));

console.log('Build successful!');