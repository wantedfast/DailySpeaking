import { z } from 'zod';
import { adminConfigured, isAdmin, sameOrigin, loginQuota, passwordMatches, newAdminToken, sessionCookie } from '@/lib/server/admin';
import { documentResponse, json } from '@/lib/server/document-http';
import { readJson } from '@/lib/server/http';
import { ApiError } from '@/lib/server/ai';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) { return json({configured:adminConfigured(), authenticated:isAdmin(request)}); }
export async function POST(request: Request) {
  return documentResponse(async () => {
    sameOrigin(request);
    if (!adminConfigured()) throw new ApiError(503, '管理员尚未配置。');
    const quota = loginQuota(request);
    if (!quota.allowed) return json({error:'登录尝试过多，请稍后重试。'}, 429, {'Retry-After':String(quota.retryAfter)});
    const parsed = z.object({password:z.string().min(1).max(1024)}).strict().safeParse(await readJson(request, 4096));
    if (!parsed.success || !passwordMatches(parsed.data.password)) throw new ApiError(401, '管理员密码不正确。');
    return json({authenticated:true}, 200, {'Set-Cookie':sessionCookie(request, newAdminToken())});
  });
}
export async function DELETE(request: Request) {
  return documentResponse(() => { sameOrigin(request); return json({authenticated:false}, 200, {'Set-Cookie':sessionCookie(request)}); });
}
