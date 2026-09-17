'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, FileText, Upload, X } from 'lucide-react';
import { appUrl } from '@/lib/url';
import { MAX_FILE_BYTES, type DocumentInfo, type DocumentDetail, type DocumentSource } from '@/lib/knowledge';

async function api(path: string, init?: RequestInit) {
  const response = await fetch(appUrl(path), {...init, cache:'no-store'});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败，请重试。');
  return data;
}
export default function KnowledgeLibrary({onClose, onSelect}: {onClose:()=>void; onSelect:(source:DocumentSource)=>void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [admin, setAdmin] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<DocumentDetail | null>(null);
  const [visibleChunks, setVisibleChunks] = useState(20);
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  async function refresh() { setDocuments((await api('/api/documents')).documents); }
  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    Promise.all([api('/api/documents'),api('/api/admin/session')]).then(([list, auth]) => {
      if (!cancelled) { setDocuments(list.documents); setAdmin(auth.authenticated); setConfigured(auth.configured); }
    }).catch(e => {if(!cancelled)setError(e.message);}).finally(() => {if(!cancelled)setLoading(false);});
    return () => { cancelled = true; };
  },[]);
  useEffect(() => {
    if (!documents.some(d => d.status === 'processing')) return;
    const interval = setInterval(() => {void refresh().catch(() => {});}, 4000);
    return () => clearInterval(interval);
  },[documents]);
  async function action(label: string, run:()=>Promise<void>) {
    if (busy) return;
    setBusy(label); setError(''); setNotice('');
    try { await run(); }
    catch(e) { setError(e instanceof Error ? e.message : '网络连接失败，请重试。'); }
    finally { setBusy(''); }
  }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {setError('单个文件不能超过 20 MB。'); return;}
    await action('正在上传并解析文档，请稍候…', async () => {
      const form = new FormData(); form.append('file',file);
      const {document} = await api('/api/documents', {method:'POST',body:form});
      await refresh();
      setNotice(document.status === 'ready' ? '文档已保存，所有访客现在都可以使用。' : '原文件已保存，但解析失败。可下载原文件，或删除后重新上传。');
      if (fileInput.current) fileInput.current.value = '';
    });
  }
  return <dialog ref={dialog} className="knowledge-dialog" aria-labelledby="knowledge-title" onCancel={e => {e.preventDefault(); if(!busy)onClose();}}>
    <div className="knowledge-heading"><div><span className="eyebrow">SHARED LIBRARY</span><h2 id="knowledge-title">共享知识库</h2></div><button className="icon-button" aria-label="关闭知识库" disabled={!!busy} onClick={onClose}><X size={20}/></button></div>
    <p className="knowledge-intro">从一份资料开始，把读到的知识讲出来。这里的文档公开共享，所有访客都可阅读、下载和练习。</p>
    <section className="knowledge-admin" aria-label="文档管理">
      {admin ? <><div className="knowledge-actions"><label className="secondary upload-label"><Upload size={16}/> 上传 PDF / Word<input ref={fileInput} type="file" aria-label="上传文档" accept=".pdf,.docx" disabled={!!busy} onChange={e => void upload(e.target.files?.[0])}/></label><button className="quiet-button" disabled={!!busy} onClick={() => void action('正在退出…',async()=>{await api('/api/admin/session',{method:'DELETE'});setAdmin(false);})}>退出管理</button></div><p>文字 PDF / DOCX · 每份最多 20 MB · 原文件保存在服务器</p></> : configured ? <form onSubmit={e => {e.preventDefault();void action('正在登录…',async()=>{await api('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});setPassword('');setAdmin(true);});}}><label htmlFor="admin-password">管理员登录</label><div className="knowledge-actions"><input id="admin-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e=>setPassword(e.target.value)} placeholder="管理员密码" disabled={!!busy}/><button className="secondary" disabled={!!busy}>登录</button></div><p>访客无需登录；管理员可上传和删除文档。</p></form> : <p>可浏览和使用共享文档。管理功能尚未开启。</p>}
    </section>
    {error && <p className="knowledge-error" role="alert">{error}</p>}
    {busy && <p role="status" className="knowledge-status">{busy}</p>}
    {notice && <p role="status" className="knowledge-status">{notice}</p>}
    <div className="knowledge-list-heading"><h3>文档 · {documents.length}</h3><button className="quiet-button" disabled={!!busy} onClick={()=>void action('正在刷新…',refresh)}>刷新列表</button></div>
    {loading ? <p role="status">正在读取知识库…</p> : documents.length === 0 ? <div className="knowledge-empty"><BookOpen size={32}/><p>还没有文档，等待管理员分享第一份资料。</p></div> : <ul className="knowledge-list">{documents.map(d=><li key={d.id}><div className="document-title"><FileText size={20}/><div><h4>{d.name}</h4><p>{d.format.toUpperCase()} · {(d.size/1024/1024).toFixed(2)} MB · {d.status==='ready'?`${d.characters.toLocaleString()} 字符`:d.status==='processing'?'正在解析':'解析失败'}</p></div></div>{d.error&&<p className="knowledge-error">{d.error}</p>}<div className="knowledge-actions"><button className="primary" disabled={!!busy||d.status!=='ready'} onClick={()=>onSelect({id:d.id,name:d.name})}>用此文档练习</button><button className="secondary" disabled={!!busy||d.status!=='ready'} onClick={()=>void action('正在读取原文…',async()=>{setPreview((await api(`/api/documents/${d.id}`)).document);setVisibleChunks(20);})}>预览文字</button><a className="quiet-button" href={appUrl(`/api/documents/${d.id}/download`)}><Download size={15}/> 下载原文件</a>{admin&&<button className="quiet-button document-delete" disabled={!!busy||d.status==='processing'} onClick={()=>{if(window.confirm(`删除「${d.name}」及其原文件？已生成的练习材料仍会保留。`))void action('正在删除…',async()=>{await api(`/api/documents/${d.id}`,{method:'DELETE'});if(preview?.id===d.id)setPreview(null);await refresh();});}}>删除</button>}</div></li>)}</ul>}
    {preview&&<section className="document-preview" aria-label="文档文字预览"><div className="knowledge-heading"><h3>{preview.name}</h3><button className="quiet-button" onClick={()=>setPreview(null)}>收起预览</button></div>{preview.chunks.slice(0,visibleChunks).map(c=><div key={c.chunkId}><strong>{c.label} · 片段 {c.chunkId}</strong><p>{c.text}</p></div>)}{preview.chunks.length>visibleChunks&&<button className="secondary" onClick={()=>setVisibleChunks(n=>n+20)}>继续阅读</button>}</section>}
  </dialog>;
}
