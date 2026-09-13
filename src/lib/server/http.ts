import { z } from 'zod';
import { ApiError } from './ai';
import { requestQuota } from './limiter';

export async function readJson(request: Request, maxBytes = 64000): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415, '请使用 JSON 格式提交。');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new ApiError(413, '提交内容过长。');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, '请求内容为空。');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new ApiError(413, '提交内容过长。'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, '请求格式不正确。'); }
}
export async function handle<T>(request: Request, schema: z.ZodType<T>, action: (input: T) => Promise<unknown>) {
  try {
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new ApiError(400, '提交内容不符合要求，请检查分类、关键词或讲解时长。');
    const quota = requestQuota(request);
    if (!quota.allowed) return Response.json({ error: '今天或本分钟的生成次数已用完，请稍后再试。' }, { status: 429, headers: { 'Retry-After': String(quota.retryAfter), 'Cache-Control': 'no-store' } });
    return Response.json(await action(parsed.data), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof ApiError ? error.message : '服务暂时不可用，请稍后重试。' }, { status: error instanceof ApiError ? error.status : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export function mockEnabled() { return process.env.NODE_ENV !== 'production' && process.env.MOCK_AI === 'true'; }
