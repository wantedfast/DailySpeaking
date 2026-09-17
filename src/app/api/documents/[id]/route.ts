import { requireAdmin } from '@/lib/server/admin';
import { documentResponse, json } from '@/lib/server/document-http';
import { knowledgeStore } from '@/lib/server/knowledge-store';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {params:Promise<{id:string}>};
export async function GET(_request: Request, context: Context) {
  return documentResponse(async () => json({document:knowledgeStore().detail((await context.params).id)}));
}
export async function DELETE(request: Request, context: Context) {
  return documentResponse(async () => { requireAdmin(request); knowledgeStore().remove((await context.params).id); return json({deleted:true}); });
}
