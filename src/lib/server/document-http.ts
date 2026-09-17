import { ApiError } from './ai';
import { MAX_FILE_BYTES } from '../knowledge';

export const json = (data: unknown, status = 200, headers: Record<string,string> = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
export async function documentResponse(action: () => Promise<Response> | Response) {
  try { return await action(); }
  catch (error) { return json({ error: error instanceof ApiError ? error.message : '服务暂时不可用，请稍后重试。' }, error instanceof ApiError ? error.status : 503); }
}
export async function readUpload(request: Request) {
  const type = request.headers.get('content-type') || '';
  if (!type.toLowerCase().startsWith('multipart/form-data;')) throw new ApiError(415, '请使用文件上传表单。');
  const limit = MAX_FILE_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError(413, '单个文件不能超过 20 MB。');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, '请选择文件。');
  const parts: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new ApiError(413, '单个文件不能超过 20 MB。'); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  let form: FormData;
  try { form = await new Response(Buffer.concat(parts), {headers:{'Content-Type':type}}).formData(); }
  catch { throw new ApiError(400, '上传格式无效，请重新选择文件。'); }
  const files = form.getAll('file');
  if (files.length !== 1 || !(files[0] instanceof File)) throw new ApiError(400, '请每次上传一个文件。');
  const file = files[0];
  if (!file.size || file.size > MAX_FILE_BYTES) throw new ApiError(413, '文件不能为空，且不能超过 20 MB。');
  const name = file.name.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, '').slice(0,240);
  const format = /\.pdf$/i.test(name) ? 'pdf' : /\.docx$/i.test(name) ? 'docx' : null;
  if (!format) throw new ApiError(415, '仅支持文字 PDF 和 DOCX，请先转换旧版 DOC 或其他格式。');
  const bytes = Buffer.from(await file.arrayBuffer());
  const zip = bytes.subarray(0,4).equals(Buffer.from([0x50,0x4b,0x03,0x04]));
  const encryptedOffice = bytes.subarray(0,8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
  if (format === 'pdf' ? !bytes.subarray(0,1024).includes(Buffer.from('%PDF-')) : !(zip || encryptedOffice)) throw new ApiError(415, '文件内容与扩展名不符。');
  return { name, format, bytes } as const;
}
