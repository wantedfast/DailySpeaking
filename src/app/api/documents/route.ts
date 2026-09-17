import { requireAdmin } from '@/lib/server/admin';
import { documentResponse, json, readUpload } from '@/lib/server/document-http';
import { knowledgeStore } from '@/lib/server/knowledge-store';
import { parseDocument } from '@/lib/server/document-parser';
import { ApiError } from '@/lib/server/ai';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uploadState = globalThis as typeof globalThis & {documentUploadBusy?:boolean};
export async function GET() { return documentResponse(() => json({documents:knowledgeStore().list()})); }
export async function POST(request: Request) {
  return documentResponse(async () => {
    requireAdmin(request);
    if (uploadState.documentUploadBusy) throw new ApiError(409, '已有文档正在上传或解析，请稍后再试。');
    uploadState.documentUploadBusy = true;
    try {
      const {name, format, bytes} = await readUpload(request);
      const store = knowledgeStore();
      const document = store.create(name, format, bytes);
      try { store.complete(document.id, await parseDocument(store.path(document.id), format)); }
      catch (error) { store.fail(document.id, error instanceof Error ? error.message : '文档解析失败。'); }
      return json({document:store.get(document.id)}, 201);
    } finally { uploadState.documentUploadBusy = false; }
  });
}
