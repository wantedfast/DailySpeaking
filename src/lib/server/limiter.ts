import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export type Limits = { minute: number; day: number; globalDay: number };
export function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}
export class RateLimiter {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS quotas (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
  }
  consume(ip: string, limits: Limits, now = Date.now()): { allowed: boolean; retryAfter: number } {
    const minute = Math.floor(now / 60000), day = Math.floor(now / 86400000);
    const identity = createHash('sha256').update(ip).digest('hex');
    const buckets = [
      { key: `m:${identity}:${minute}`, max: limits.minute, expires: (minute + 1) * 60000 },
      { key: `d:${identity}:${day}`, max: limits.day, expires: (day + 1) * 86400000 },
      { key: `g:${day}`, max: limits.globalDay, expires: (day + 1) * 86400000 },
    ];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM quotas WHERE expires <= ?').run(now);
      let retryAfter = 0;
      for (const bucket of buckets) {
        const row = this.db.prepare('SELECT count FROM quotas WHERE bucket = ?').get(bucket.key) as { count: number } | undefined;
        if (row && row.count >= bucket.max) retryAfter = Math.max(retryAfter, Math.ceil((bucket.expires - now) / 1000));
      }
      if (retryAfter) { this.db.exec('COMMIT'); return { allowed: false, retryAfter }; }
      for (const bucket of buckets) this.db.prepare('INSERT INTO quotas(bucket,count,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count = count + 1').run(bucket.key, bucket.expires);
      this.db.exec('COMMIT');
      return { allowed: true, retryAfter: 0 };
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
}
let limiter: RateLimiter | undefined;
export function requestQuota(request: Request) {
  limiter ??= new RateLimiter(process.env.SQLITE_PATH || resolve('data/quotas.sqlite'));
  const ip = process.env.TRUST_PROXY === 'true' ? (request.headers.get('x-real-ip')?.slice(0, 128) || 'anonymous') : 'anonymous';
  return limiter.consume(ip, { minute: positiveInt(process.env.RATE_LIMIT_PER_MINUTE, 5), day: positiveInt(process.env.RATE_LIMIT_PER_DAY, 60), globalDay: positiveInt(process.env.RATE_LIMIT_GLOBAL_PER_DAY, 500) });
}
