import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { docxFixture, pdfFixture, sourceText } from './document-fixtures';
import { parseDocument } from '../src/lib/server/document-parser';
import { KnowledgeStore, knowledgeStore } from '../src/lib/server/knowledge-store';
import { newAdminToken, isAdmin, sameOrigin, requireAdmin, sessionCookie, passwordMatches } from '../src/lib/server/admin';
import { readUpload } from '../src/lib/server/document-http';
import { sampleChunks, retrieveChunks, documentTopic, documentResearch } from '../src/lib/server/document-generation';
import { sessionSchema, freshSession } from '../src/lib/practice';

test('Chinese PDF preserves text and page provenance; DOCX preserves paragraph provenance',async()=>{
  const directory = mkdtempSync(join(tmpdir(),'speaking-parser-'));
  try {
    const pdf = join(directory,'test.pdf'), docx = join(directory,'test.docx');
    writeFileSync(pdf,pdfFixture([sourceText,sourceText.replaceAll('知识管理','学习管理')]));
    writeFileSync(docx,await docxFixture(`${sourceText}\n\n${sourceText}`));
    const pdfChunks = await parseDocument(pdf,'pdf');
    assert.match(pdfChunks[0].text,/知识管理/);
    assert.equal(pdfChunks[0].label,'第 1 页');
    assert.equal(pdfChunks.at(-1)?.label,'第 2 页');
    const wordChunks = await parseDocument(docx,'docx');
    assert.equal(wordChunks[0].text,sourceText);
    assert.equal(wordChunks[1].label,'第 2 段');
  } finally {rmSync(directory,{recursive:true,force:true});}
});
test('parser rejects blank PDF, corrupt Word, excessive decompression, and times out',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'speaking-invalid-'));
  try {
    const path=join(directory,'document');
    writeFileSync(path,pdfFixture(['']));
    await assert.rejects(parseDocument(path,'pdf'),/OCR/);
    writeFileSync(path,'invalid');
    await assert.rejects(parseDocument(path,'docx'),/损坏/);
    writeFileSync(path,Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
    await assert.rejects(parseDocument(path,'docx'),/加密或旧版/);
    const zip = new JSZip(); zip.file('word/document.xml','x'.repeat(21*1024*1024));
    writeFileSync(path,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
    await assert.rejects(parseDocument(path,'docx'),/过大/);
    writeFileSync(path,await docxFixture());
    await assert.rejects(parseDocument(path,'docx',1),/超时/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
test('original bytes, ready content and failed documents survive reopening; deletion cleans both',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'speaking-store-'));
  let store=new KnowledgeStore(directory);
  try {
    const bytes=await docxFixture();
    const document=store.create('中文.docx','docx',bytes), path=store.path(document.id);
    store.complete(document.id,[{chunkId:1,label:'第 1 段',text:sourceText}]);
    const interrupted=store.create('interrupted.pdf','pdf',Buffer.from('%PDF-'));
    store.close();store=new KnowledgeStore(directory);
    assert.deepEqual(readFileSync(path),bytes);
    assert.equal(store.detail(document.id).chunks[0].text,sourceText);
    assert.equal(store.get(interrupted.id).status,'failed');
    assert.ok(existsSync(store.path(interrupted.id)));
    store.remove(document.id);assert.equal(existsSync(path),false);
    assert.throws(()=>store.detail(document.id),/不存在/);
    assert.throws(()=>store.path('../outside'),/不存在/);
    assert.equal(store.list().length,1);
  } finally {store.close();rmSync(directory,{recursive:true,force:true});}
});
test('admin cookies expire, reject forgery and password rotation; management enforces origin',()=>{
  const old=process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD='unit-test-password';
  const request=(token:string,origin='http://localhost')=>new Request('http://localhost/api/documents',{headers:{origin,cookie:`daily-speaking-admin=${token}`}});
  try {
    assert.equal(passwordMatches('wrong'),false);
    assert.equal(passwordMatches('unit-test-password'),true);
    const token=newAdminToken();
    assert.equal(isAdmin(request(token)),true);
    assert.equal(isAdmin(request(token+'a')),false);
    assert.equal(isAdmin(request(newAdminToken(1))),false);
    assert.throws(()=>sameOrigin(request(token,'https://evil.example')),/本站/);
    assert.throws(()=>requireAdmin(request('')),/登录/);
    assert.doesNotThrow(()=>requireAdmin(request(token)));
    assert.match(sessionCookie(request(token),token),/HttpOnly; SameSite=Strict/);
    assert.match(sessionCookie(request(token)),/Max-Age=0/);
    process.env.ADMIN_PASSWORD='rotated';assert.equal(isAdmin(request(token)),false);
    delete process.env.ADMIN_PASSWORD;assert.throws(()=>requireAdmin(request(token)),/尚未配置/);
  } finally {if(old===undefined)delete process.env.ADMIN_PASSWORD;else process.env.ADMIN_PASSWORD=old;}
});
test('uploads validate actual type, format, empty content and streamed size',async()=>{
  const request=(name:string,bytes:Uint8Array)=>{const form=new FormData();form.set('file',new Blob([new Uint8Array(bytes)]),name);return new Request('http://localhost/api/documents',{method:'POST',body:form});};
  assert.equal((await readUpload(request('测试.docx',await docxFixture()))).format,'docx');
  await assert.rejects(readUpload(request('test.doc',Buffer.from('old'))),/仅支持/);
  await assert.rejects(readUpload(request('test.pdf',Buffer.from('fake'))),/扩展名/);
  await assert.rejects(readUpload(request('test.pdf',Buffer.alloc(0))),/不能为空/);
  const oversized = new Request('http://localhost/api/documents',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=test'},body:Buffer.alloc(21*1024*1024)});
  await assert.rejects(readUpload(oversized),/20 MB/);
});
test('sampling reaches the end, retrieval finds Chinese concepts beyond the beginning and old sessions still load',()=>{
  const chunks=Array.from({length:40},(_,i)=>({chunkId:i+1,label:`第 ${i+1} 页`,text:i===39?sourceText:'完全不同的原文内容'}));
  assert.equal(sampleChunks(chunks).at(-1)?.chunkId,40);
  assert.equal(retrieveChunks(chunks,'知识管理')[0].chunkId,40);
  assert.equal(retrieveChunks(chunks,'photosynthesis').length,0);
  assert.equal(sessionSchema.safeParse(freshSession()).success,true);
});
test('document generation sends original context, returns verified citations and rejects invented provenance or insufficient material',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'speaking-generation-'));
  const oldDirectory=process.env.KNOWLEDGE_DIR, oldKey=process.env.DEEPSEEK_API_KEY, oldMock=process.env.MOCK_AI, oldFetch=globalThis.fetch;
  const shared=globalThis as typeof globalThis & {knowledgeStore?:KnowledgeStore};
  const oldStore=shared.knowledgeStore;
  process.env.KNOWLEDGE_DIR=directory;process.env.DEEPSEEK_API_KEY='test-only';process.env.MOCK_AI='false';delete shared.knowledgeStore;
  const store=knowledgeStore();
  try {
    const doc=store.create('唯一来源.docx','docx',await docxFixture());
    store.complete(doc.id,[{chunkId:1,label:'第 1 段',text:sourceText}]);
    let output:unknown={word:'知识管理',intro:'理解文档中的知识管理',chunkIds:[1]};
    globalThis.fetch=(async(_url,init)=>{
      const request=JSON.parse(String(init?.body));
      assert.match(request.messages[0].content,/所有事实必须来自给定原文/);
      assert.ok(request.messages[1].content.includes(sourceText));
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]});
    }) as typeof fetch;
    assert.equal((await documentTopic(doc.id,[])).word,'知识管理');
    output={sections:Array.from({length:6},(_,i)=>({title:`第${i+1}节`,body:sourceText})),questions:['问题一','问题二','问题三'],chunkIds:[1]};
    const research=await documentResearch(doc.id,'知识管理');
    assert.equal(research.source.id,doc.id);assert.equal(research.citations[0].text,sourceText);
    output={word:'知识管理',intro:'主题',chunkIds:[999]};
    await assert.rejects(documentTopic(doc.id,[]),/出处无效/);
    output={insufficient:true};
    await assert.rejects(documentResearch(doc.id,'知识管理'),/原文不足/);
    store.remove(doc.id);await assert.rejects(documentTopic(doc.id,[]),/不存在/);
  } finally {
    store.close();shared.knowledgeStore=oldStore;globalThis.fetch=oldFetch;
    if(oldDirectory===undefined)delete process.env.KNOWLEDGE_DIR;else process.env.KNOWLEDGE_DIR=oldDirectory;
    if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;
    if(oldMock===undefined)delete process.env.MOCK_AI;else process.env.MOCK_AI=oldMock;
    rmSync(directory,{recursive:true,force:true});
  }
});
