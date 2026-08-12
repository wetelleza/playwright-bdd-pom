import { build } from 'esbuild';
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const infraDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(infraDir, '..');
const distDir = join(infraDir, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

await build({
  entryPoints: [join(infraDir, 'lambda', 'handler.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: join(distDir, 'handler.js'),
  external: ['aws-sdk'], // provided by the Lambda runtime, no need to bundle it
});

// ai/stepCatalog.ts reads these as real files at runtime (repoRoot defaults to process.cwd(),
// which is /var/task in Lambda) — same live-catalog mechanism as local/CI, they just need to
// physically exist in the deployed package.
cpSync(join(repoRoot, 'steps'), join(distDir, 'steps'), { recursive: true });
cpSync(join(repoRoot, 'features'), join(distDir, 'features'), { recursive: true });

console.log(`Built ${distDir}`);
