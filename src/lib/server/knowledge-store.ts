import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError } from './ai';
import type { Citation, DocumentInfo, DocumentDetail } from '../knowledge';

export class KnowledgeStore {
  readonly directory: string;
  private db: DatabaseSync;
  constructor(directory: string) {
    this.directory = resolve(directory);
    mkdirSync(join(this.directory, 'files'), { recursive: true });
    this.db = new DatabaseSync(join(this.directory, 'knowledge.sqlite'));
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL,
        size INTEGER NOT NULL, createdAt TEXT NOT NULL, status TEXT NOT NULL, error TEXT, characters INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS chunks (documentId TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunkId INTEGER NOT NULL, label TEXT NOT NULL, text TEXT NOT NULL, PRIMARY KEY(documentId, chunkId));`);
    // Single application instance: interrupted imports never appear usable after restart.
    this.db.prepare("UPDATE documents SET status='failed', error='解析被服务重启中断，请删除后重新上传。' WHERE status='processing'").run();
    const ids = new Set((this.db.prepare('SELECT id FROM documents').all() as {id:string}[]).map(r => r.id));
    for (const file of readdirSync(join(this.directory, 'files'))) {
      if (/^[\da-f-]{36}$/.test(file) && !ids.has(file)) unlinkSync(join(this.directory, 'files', file));
    }
  }
  list(): DocumentInfo[] { return this.db.prepare('SELECT * FROM documents ORDER BY createdAt DESC, id').all() as DocumentInfo[]; }
  get(id: string): DocumentInfo {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(id)) throw new ApiError(404, '文档不存在或已被删除，请重新选择。');
    const row = this.db.prepare('SELECT * FROM documents WHERE id=?').get(id) as DocumentInfo | undefined;
    if (!row) throw new ApiError(404, '文档不存在或已被删除，请重新选择。');
    return row;
  }
  path(id: string) { this.get(id); return join(this.directory, 'files', id); }
  detail(id: string): DocumentDetail {
    return { ...this.get(id), chunks: this.db.prepare('SELECT chunkId,label,text FROM chunks WHERE documentId=? ORDER BY chunkId').all(id) as Citation[] };
  }
  create(name: string, format: 'pdf'|'docx', bytes: Uint8Array): DocumentInfo {
    const id = randomUUID(), path = join(this.directory, 'files', id);
    writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 });
    try {
      this.db.prepare("INSERT INTO documents(id,name,format,size,createdAt,status) VALUES (?,?,?,?,?,'processing')").run(id, name, format, bytes.length, new Date().toISOString());
    } catch (error) { unlinkSync(path); throw error; }
    return this.get(id);
  }
  complete(id: string, chunks: Citation[]) {
    this.get(id);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM chunks WHERE documentId=?').run(id);
      const insert = this.db.prepare('INSERT INTO chunks(documentId,chunkId,label,text) VALUES (?,?,?,?)');
      for (const chunk of chunks) insert.run(id, chunk.chunkId, chunk.label, chunk.text);
      this.db.prepare("UPDATE documents SET status='ready', error=NULL, characters=? WHERE id=?").run(chunks.reduce((sum, c) => sum+c.text.length, 0), id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  fail(id: string, message: string) { this.db.prepare("UPDATE documents SET status='failed', error=? WHERE id=?").run(message, id); }
  remove(id: string) {
    const info = this.get(id);
    if (info.status === 'processing') throw new ApiError(409, '文档正在解析，请稍后删除。');
    // If interrupted after DB deletion, constructor removes the orphaned original.
    const path = this.path(id);
    this.db.prepare('DELETE FROM documents WHERE id=?').run(id);
    try { unlinkSync(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  close() { this.db.close(); }
}
const globalStore = globalThis as typeof globalThis & { knowledgeStore?: KnowledgeStore };
export function knowledgeStore() {
  return globalStore.knowledgeStore ??= new KnowledgeStore(process.env.KNOWLEDGE_DIR || './data/knowledge');
}
