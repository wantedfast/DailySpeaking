import { Worker } from 'node:worker_threads';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Citation } from '../knowledge';

export function parseDocument(path: string, format: 'pdf' | 'docx', timeoutMs = 45000): Promise<Citation[]> {
  return new Promise((resolveResult, reject) => {
    // Load the copied ESM file natively. Bundling this file rewrites PDF.js asset
    // resolution (require.resolve) into module IDs rather than filesystem paths.
    const bootstrap = `import(${JSON.stringify(pathToFileURL(resolve(process.cwd(), 'src/lib/server/document-parser.mjs')).href)})`;
    const worker = new Worker(bootstrap, {
      workerData: {path, format}, resourceLimits: {maxOldGenerationSizeMb: 192, stackSizeMb: 4},
      execArgv: [], eval: true,
    });
    let settled = false;
    const finish = (error?: Error, chunks?: Citation[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); void worker.terminate();
      if (error) reject(error); else resolveResult(chunks!);
    };
    const timer = setTimeout(() => finish(new Error('解析超时，请拆分文档后重新上传。')), timeoutMs);
    worker.once('message', (result: {error?:string; chunks:Citation[]}) => finish(result.error ? new Error(result.error) : undefined, result.chunks));
    worker.once('error', () => finish(new Error('解析资源不足或文件异常，请拆分文档后重试。')));
    worker.once('exit', () => { if (!settled) finish(new Error('解析未完成，请重新上传。')); });
  });
}
