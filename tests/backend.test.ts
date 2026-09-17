import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { RateLimiter } from '../src/lib/server/limiter';
import { ApiError, generate } from '../src/lib/server/ai';
import { readJson, mockEnabled } from '../src/lib/server/http';
import { topicInput, speechInput, researchOutput } from '../src/lib/server/schemas';
import { mockResearch } from '../src/lib/server/fixtures';

test('input validation enforces categories, recent word cap, valid durations and research structure', () => {
  for (const category of ['accounting', 'ai', 'computing', 'nature', 'hr']) assert.equal(topicInput.safeParse({ category }).success, true);
  assert.equal(topicInput.safeParse({ category: 'other' }).success, false);
  assert.equal(topicInput.safeParse({ category: 'ai', recentWords: Array(31).fill('词') }).success, false);
  const research = mockResearch('缓存');
  assert.equal(researchOutput.safeParse(research).success, true);
  for (const minutes of [3, 4, 5]) assert.equal(speechInput.safeParse({ word: '缓存', research, minutes }).success, true);
  assert.equal(speechInput.safeParse({ word: '缓存', research, minutes: 10 }).success, false);
  assert.equal(speechInput.safeParse({ word: '缓存', research: { ...research, questions: [] }, minutes: 3 }).success, false);
});

test('SQLite quota is atomic across connections, persists and resets by window', () => {
  const directory = mkdtempSync(join(tmpdir(), 'speaking-quota-'));
  const path = join(directory, 'quota.sqlite');
  const a = new RateLimiter(path), b = new RateLimiter(path);
  const limits = { minute: 2, day: 3, globalDay: 4 };
  try {
    assert.equal(a.consume('one', limits, 1000).allowed, true);
    assert.equal(b.consume('one', limits, 1000).allowed, true);
    assert.deepEqual(a.consume('one', limits, 1000), { allowed: false, retryAfter: 59 });
    assert.equal(b.consume('one', limits, 61000).allowed, true);
    assert.equal(a.consume('one', limits, 61000).allowed, false);
    assert.equal(a.consume('two', limits, 61000).allowed, true);
    assert.equal(b.consume('three', limits, 61000).allowed, false);
    assert.equal(a.consume('one', limits, 86401000).allowed, true);
  } finally { a.close(); b.close(); }
  const reopened = new RateLimiter(path);
  try { assert.equal(reopened.consume('one', { minute: 1, day: 3, globalDay: 4 }, 86401000).allowed, false); }
  finally { reopened.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('request body handles malformed and oversized JSON including absent length header', async () => {
  const request = (body: string, type = 'application/json') => new Request('http://localhost/api/topic', { method: 'POST', headers: { 'Content-Type': type }, body });
  assert.deepEqual(await readJson(request('{"a":1}')), { a: 1 });
  await assert.rejects(readJson(request('{')), (e: unknown) => e instanceof ApiError && e.status === 400);
  await assert.rejects(readJson(request('{}', 'text/plain')), (e: unknown) => e instanceof ApiError && e.status === 415);
  await assert.rejects(readJson(request(JSON.stringify({ body: '界'.repeat(50) })), 30), (e: unknown) => e instanceof ApiError && e.status === 413);
});

test('AI validates outputs, hides provider errors and maps timeout and quota failures', async () => {
  const oldKey = process.env.DEEPSEEK_API_KEY, oldTimeout = process.env.AI_TIMEOUT_MS;
  process.env.DEEPSEEK_API_KEY = 'test-secret-do-not-expose';
  const shape = z.object({ word: z.string() });
  const response = (status: number, data: unknown) => (async () => Response.json(data, { status })) as typeof fetch;
  try {
    const inspectingFetcher = (async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      assert.deepEqual(body.thinking, { type: 'disabled' });
      assert.equal(body.max_tokens, 500);
      assert.deepEqual(body.response_format, { type: 'json_object' });
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"word":"缓存"}' } }] });
    }) as typeof fetch;
    assert.deepEqual(await generate(shape, 'test', 500, inspectingFetcher), { word: '缓存' });
    assert.deepEqual(await generate(shape, 'test', 100, response(200, { choices: [{ finish_reason: 'stop', message: { content: '{"word":"缓存"}' } }] })), { word: '缓存' });
    for (const status of [401, 402, 403, 429, 500]) await assert.rejects(generate(shape, 'test', 100, response(status, { error: 'test-secret-do-not-expose' })), (e: unknown) => e instanceof ApiError && !e.message.includes('test-secret'));
    await assert.rejects(generate(shape, 'test', 100, response(200, { choices: [{ finish_reason: 'length', message: { content: '{}' } }] })), (e: unknown) => e instanceof ApiError && e.status === 502);
    await assert.rejects(generate(shape, 'test', 100, response(200, { choices: [{ finish_reason: 'stop', message: { content: '{"unexpected":1}' } }] })), (e: unknown) => e instanceof ApiError && e.status === 502);
    process.env.AI_TIMEOUT_MS = '5';
    const hanging = ((_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new Error('aborted'))))) as typeof fetch;
    await assert.rejects(generate(shape, 'test', 100, hanging), (e: unknown) => e instanceof ApiError && e.status === 504);
    delete process.env.DEEPSEEK_API_KEY;
    await assert.rejects(generate(shape, 'test', 100, response(200, {})), (e: unknown) => e instanceof ApiError && e.status === 503);
  } finally {
    if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = oldKey;
    if (oldTimeout === undefined) delete process.env.AI_TIMEOUT_MS; else process.env.AI_TIMEOUT_MS = oldTimeout;
  }
});

test('mock generation cannot be enabled in production', () => {
  const env = process.env as Record<string, string | undefined>;
  const oldNode = env.NODE_ENV, oldMock = env.MOCK_AI;
  try { env.NODE_ENV = 'production'; env.MOCK_AI = 'true'; assert.equal(mockEnabled(), false); env.NODE_ENV = 'test'; assert.equal(mockEnabled(), true); }
  finally { if (oldNode === undefined) delete env.NODE_ENV; else env.NODE_ENV = oldNode; if (oldMock === undefined) delete env.MOCK_AI; else env.MOCK_AI = oldMock; }
});

test('AI repairs malformed output once using the same deadline and never retries provider failures', async () => {
  const oldKey = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-only';
  try {
    let calls = 0;
    let signal: AbortSignal | null | undefined;
    const fetcher = (async (_url: unknown, init: RequestInit) => {
      const request = JSON.parse(String(init.body));
      calls++;
      if (calls === 1) signal = init.signal;
      else { assert.equal(init.signal, signal); assert.match(request.messages.at(-1).content, /未通过格式校验/); }
      assert.match(request.messages[0].content, /JSON Schema/);
      return Response.json({choices:[{finish_reason:'stop',message:{content:calls === 1 ? '{"wrong":true}' : '{"word":"知识管理"}'}}]});
    }) as typeof fetch;
    assert.deepEqual(await generate(z.object({word:z.string()}).strict(),'test',500,fetcher),{word:'知识管理'});
    assert.equal(calls,2);
    calls=0;
    await assert.rejects(generate(z.object({word:z.string()}),'test',500,(async()=>{calls++;return Response.json({},{status:429});}) as typeof fetch),ApiError);
    assert.equal(calls,1);
    calls=0;
    await assert.rejects(generate(z.object({word:z.string()}),'test',500,(async()=>{calls++;return Response.json({choices:[{finish_reason:'stop',message:{content:'not json'}}]});}) as typeof fetch),ApiError);
    assert.equal(calls,2);
  } finally {if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;}
});
