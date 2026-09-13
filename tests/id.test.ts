import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionId } from '../src/lib/id';
test('session IDs work on plain HTTP where randomUUID is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: (bytes: Uint8Array) => { bytes.fill(123); return bytes; } } });
  try { assert.match(createSessionId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); }
  finally { if (original) Object.defineProperty(globalThis, 'crypto', original); }
});
