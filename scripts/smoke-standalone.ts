import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { docxFixture, pdfFixture } from '../tests/document-fixtures';

async function main() {
  const root = mkdtempSync(join(tmpdir(),'daily-speaking-standalone-'));
  const application=join(root,'application');
  const basePath=JSON.parse(readFileSync('.next/required-server-files.json','utf8')).config.basePath || '';
  const port = await new Promise<number>(resolvePort=>{const server=createServer();server.listen(0,'127.0.0.1',()=>{const port=(server.address() as {port:number}).port;server.close(()=>resolvePort(port));});});
  const origin=`http://127.0.0.1:${port}`, url=(path:string)=>`${origin}${basePath}${path}`;
  const password=randomBytes(24).toString('hex');
  let child:ChildProcess|undefined, logs='';
  async function stop() {
    if(child && child.exitCode===null) {const process=child;await new Promise<void>(done=>{process.once('exit',()=>done());process.kill();});}
    child=undefined;
  }
  async function start(adminPassword=password) {
    child=spawn(process.execPath,['server.js'],{cwd:application,windowsHide:true,env:{...process.env,NODE_ENV:'production',PORT:String(port),HOSTNAME:'127.0.0.1',KNOWLEDGE_DIR:join(root,'data'),SQLITE_PATH:join(root,'quotas.sqlite'),ADMIN_PASSWORD:adminPassword,DEEPSEEK_API_KEY:'',TRUST_PROXY:'false'}});
    child.stdout?.on('data',data=>{logs+=String(data);});child.stderr?.on('data',data=>{logs+=String(data);});
    for(let attempt=0;attempt<100;attempt++){
      try{if((await fetch(url('/api/health'))).ok)return;}catch{}
      if(child.exitCode!==null)throw new Error(logs);
      await new Promise(r=>setTimeout(r,200));
    }
    throw new Error(`Standalone startup timed out: ${logs}`);
  }
  try {
    // A copy outside the repository prevents accidental dependency resolution from source node_modules.
    cpSync(resolve('.next/standalone'),application,{recursive:true});
    cpSync(resolve('.next/static'),join(application,'.next/static'),{recursive:true});
    cpSync(resolve('public'),join(application,'public'),{recursive:true});
    await start();
    assert.equal((await fetch(url('/'))).status,200);
    const login=await fetch(url('/api/admin/session'),{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({password})});
    assert.equal(login.status,200);const cookie=login.headers.get('set-cookie')!.split(';')[0];
    const documents:{id:string;bytes:Buffer}[]=[];
    for(const [name,bytes] of [['生产测试.docx',await docxFixture()],['生产测试.pdf',pdfFixture()]] as const) {
      const form=new FormData();form.set('file',new Blob([new Uint8Array(bytes)]),name);
      const response=await fetch(url('/api/documents'),{method:'POST',headers:{Origin:origin,Cookie:cookie},body:form});
      assert.equal(response.status,201);
      const {document}=await response.json();assert.equal(document.status,'ready',JSON.stringify(document));
      documents.push({id:document.id,bytes});
    }
    await stop();await start();
    assert.equal((await (await fetch(url('/api/documents'))).json()).documents.length,2);
    for(const document of documents){
      const downloaded=Buffer.from(await(await fetch(url(`/api/documents/${document.id}/download`))).arrayBuffer());
      assert.deepEqual(downloaded,document.bytes);
      const detail=await(await fetch(url(`/api/documents/${document.id}`))).json();assert.match(detail.document.chunks[0].text,/知识管理/);
    }
    await stop();await start('');
    const auth=await(await fetch(url('/api/admin/session'),{headers:{Cookie:cookie}})).json();
    assert.equal(auth.configured,false);assert.equal(auth.authenticated,false);
    assert.equal((await fetch(url(`/api/documents/${documents[0].id}`),{method:'DELETE',headers:{Origin:origin,Cookie:cookie}})).status,503);
    console.log(`Standalone smoke passed (${basePath || '/'}): isolated PDF/DOCX parsing, downloads, restart persistence, unconfigured admin protection.`);
  } finally {
    await stop();
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unexpected temporary directory');
    rmSync(root,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
