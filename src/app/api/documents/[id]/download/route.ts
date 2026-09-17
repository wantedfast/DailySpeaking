import { readFile } from 'node:fs/promises';
import { documentResponse } from '@/lib/server/document-http';
import { knowledgeStore } from '@/lib/server/knowledge-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: {params:Promise<{id:string}>}) {
  return documentResponse(async () => {
    const store = knowledgeStore(), id = (await context.params).id, document = store.get(id);
    return new Response(await readFile(store.path(id)), {headers:{
      'Content-Type':document.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition':`attachment; filename="document.${document.format}"; filename*=UTF-8''${encodeURIComponent(document.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
      'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store',
    }});
  });
}
