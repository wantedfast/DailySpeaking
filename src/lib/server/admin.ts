import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';
import { ApiError } from './ai';
import { RateLimiter } from './limiter';

const cookieName = 'daily-speaking-admin';
const duration = 8 * 60 * 60;
const digest = (value: string) => createHash('sha256').update(value).digest();
export function adminConfigured() { return Boolean(process.env.ADMIN_PASSWORD); }
export function passwordMatches(value: string) { return adminConfigured() && timingSafeEqual(digest(value), digest(process.env.ADMIN_PASSWORD!)); }
function signature(value: string) { return createHmac('sha256', process.env.ADMIN_PASSWORD || '').update(`daily-speaking-session:${value}`).digest('hex'); }
export function newAdminToken(now = Date.now()) {
  const payload = `${now + duration * 1000}.${randomBytes(24).toString('hex')}`;
  return `${payload}.${signature(payload)}`;
}
export function isAdmin(request: Request, now = Date.now()) {
  if (!adminConfigured()) return false;
  const token = request.headers.get('cookie')?.split(';').map(p => p.trim()).find(p => p.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!token || !/^\d+\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, mac] = token.split('.');
  return Number(expires) > now && Number(expires) <= now + duration * 1000 && timingSafeEqual(digest(mac), digest(signature(`${expires}.${nonce}`)));
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  try {
    const parsed = new URL(origin || '');
    const protocol = process.env.TRUST_PROXY === 'true' && request.headers.get('x-forwarded-proto')
      ? `${request.headers.get('x-forwarded-proto')}:` : new URL(request.url).protocol;
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.protocol !== protocol || parsed.host !== (request.headers.get('host') || new URL(request.url).host)) throw new Error();
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new Error();
  } catch { throw new ApiError(403, '请从本站页面提交操作。'); }
}
export function requireAdmin(request: Request) {
  sameOrigin(request);
  if (!adminConfigured()) throw new ApiError(503, '管理员尚未配置，暂时无法管理文档。');
  if (!isAdmin(request)) throw new ApiError(401, '请先登录管理员。');
}
export function sessionCookie(request: Request, token = '') {
  const secure = new URL(request.headers.get('origin') || request.url).protocol === 'https:';
  return `${cookieName}=${token}; Path=${process.env.NEXT_PUBLIC_BASE_PATH || '/'}; HttpOnly; SameSite=Strict; Max-Age=${token ? duration : 0}${secure ? '; Secure' : ''}`;
}
let loginLimiter: RateLimiter | undefined;
export function loginQuota(request: Request) {
  loginLimiter ??= new RateLimiter(join(process.env.KNOWLEDGE_DIR || './data/knowledge', 'login-quotas.sqlite'));
  const ip = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-real-ip')?.slice(0, 128) || 'anonymous' : 'anonymous';
  return loginLimiter.consume(ip, { minute: 5, day: 100, globalDay: 1000 });
}
