import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
// Workers are loaded by absolute filesystem path, outside Next's module bundle.
// Include their dependency closure, including the installed platform canvas binary.
const runtimeFiles = new Set<string>();
function includePackage(name: string, from = resolve('package.json'), optional = false) {
  let manifest: string;
  try { manifest = createRequire(from).resolve(`${name}/package.json`); }
  catch (error) { if (optional) return; throw error; }
  const pattern = relative(process.cwd(), dirname(manifest)).replaceAll('\\', '/') + '/**/*';
  if (runtimeFiles.has(pattern)) return;
  runtimeFiles.add(pattern);
  const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  for (const dependency of Object.keys(pkg.dependencies || {})) includePackage(dependency, manifest);
  for (const dependency of Object.keys(pkg.optionalDependencies || {})) includePackage(dependency, manifest, true);
}
for (const name of ['pdfjs-dist', 'mammoth', 'yauzl']) includePackage(name);
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
if (basePath && !/^\/[a-zA-Z0-9/_-]+$/.test(basePath)) throw new Error('Invalid NEXT_PUBLIC_BASE_PATH');
const config: NextConfig = { output: 'standalone', poweredByHeader: false, devIndicators: false, basePath, experimental: { cpus: 1 },
  serverExternalPackages: ['pdfjs-dist', 'mammoth', 'yauzl'],
  outputFileTracingIncludes: { '/*': ['src/lib/server/document-parser.mjs', ...runtimeFiles] },
};
export default config;
