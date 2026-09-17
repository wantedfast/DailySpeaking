'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, AudioLines, BookOpen, ChartNoAxesCombined, Check, ChevronLeft, Clock3, History, Leaf, Monitor, Pause, Play, RotateCcw, Shuffle, Sparkles, Users, X } from 'lucide-react';
import { z } from 'zod';
import { appUrl } from '@/lib/url';
import { createSessionId } from '@/lib/id';
import { addRecord, categories, emptyTimer, freshSession, recordSchema, remainingTime, sessionSchema, type Category, type PracticeRecord, type Research, type Session, type Speech, type Topic } from '@/lib/practice';

const STORE = 'daily-speaking-v1';
const icons = { chart: ChartNoAxesCombined, spark: Sparkles, computer: Monitor, leaf: Leaf, people: Users };
const savedSchema = z.object({ session: sessionSchema, records:z.array(recordSchema).max(30), words:z.array(z.string().max(80)).max(30) });

export default function Home() {
  const [session,setSession] = useState<Session | null>(null);
  const [records,setRecords] = useState<PracticeRecord[]>([]);
  const [words,setWords] = useState<string[]>([]);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [storageWarning,setStorageWarning] = useState('');
  const [showHistory,setShowHistory] = useState(false);
  const [view,setView] = useState<'full'|'outline'|'hidden'>('full');
  const [now,setNow] = useState(0);
  const lock = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) {
        const saved = savedSchema.parse(JSON.parse(raw));
        setSession(saved.session); setRecords(saved.records); setWords(saved.words);
      } else setSession(freshSession());
    } catch { setSession(freshSession()); setStorageWarning('浏览器未能恢复记录，本次可以继续练习。'); }
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()),250);
    return () => clearInterval(interval);
  },[]);
  useEffect(() => {
    if (!session) return;
    try { localStorage.setItem(STORE,JSON.stringify({session,records,words})); }
    catch { setStorageWarning('浏览器无法保存记录，请保持当前页面打开。'); }
  },[session,records,words]);
  const remaining = session ? remainingTime(session.timer,now) : 600000;
  useEffect(() => {
    if (!session || !session.timer.started || remaining > 0 || session.timer.deadline === null) return;
    if (session.stage === 'speech') {
      setRecords(r => addRecord(r,{id:session.id,word:session.topic!.word,category:session.category,minutes:session.minutes,date:new Date().toISOString()}));
      setSession(s => s ? {...s,stage:'done',timer:{...s.timer,remaining:0,deadline:null}} : s);
    } else setSession(s => s ? {...s,timer:{...s.timer,remaining:0,deadline:null}} : s);
  },[remaining,session]);

  async function request<T>(path: string, body: unknown, label: string): Promise<T | null> {
    if(lock.current) return null;
    lock.current = true; setBusy(label); setError('');
    const controller = new AbortController();
    activeRequest.current = controller;
    try {
      const response = await fetch(appUrl(`/api/${path}`),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([controller.signal, AbortSignal.timeout(125000)])});
      const data = await response.json();
      if (controller.signal.aborted) return null;
      if(!response.ok) throw new Error(data.error || '生成暂时失败，请重试。');
      return data as T;
    } catch(e) {
      if (controller.signal.aborted) return null;
      setError(e instanceof Error && e.name === 'TimeoutError' ? '生成时间较长，请稍后重试，已完成的内容会保留。' : e instanceof Error && e.name !== 'TypeError' ? e.message : '网络连接失败，请检查网络后重试。');
      return null;
    } finally {
      if (activeRequest.current === controller) { activeRequest.current = null; lock.current = false; setBusy(''); }
    }
  }
  async function draw() {
    if(!session) return;
    const topic = await request<Topic>('topic',{category:session.category,recentWords:words},'正在为你寻找一个值得探索的词…');
    if(topic) {
      setSession({...freshSession(session.category),stage:'topic',topic});
      setWords(w => [topic.word,...w.filter(word => word !== topic.word)].slice(0,30));
    }
  }
  async function research() {
    if(!session?.topic) return;
    const result = await request<Research>('research',{category:session.category,word:session.topic.word},'正在整理概念、例子和理解线索，通常需要一点时间…');
    if(result) setSession({...session,research:result,stage:'research',timer:emptyTimer()});
  }
  async function makeSpeech() {
    if(!session?.research) return;
    const result = await request<Speech>('speech',{word:session.topic!.word,research:session.research,minutes:session.minutes},'正在把知识整理成自然的口头表达…');
    if(result) { setSession({...session,speech:result,stage:'speech',timer:emptyTimer(session.minutes*60000)}); setView('full'); }
  }
  function toggleTimer() {
    const time = Date.now(); setNow(time);
    setSession(s => s ? {...s,timer: s.timer.deadline !== null ? {...s.timer,remaining:remainingTime(s.timer,time),deadline:null} : {...s.timer,started:true,deadline:time+s.timer.remaining}} : s);
  }
  function reset(category?: Category) {
    activeRequest.current?.abort(); activeRequest.current = null; lock.current = false;
    setBusy(''); setError(''); setShowHistory(false);
    setSession(freshSession(category || session?.category)); setView('full');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  const category = categories.find(c => c.id === session?.category) || categories[0];
  const activeStep = !session || ['choose','topic'].includes(session.stage) ? 0 : session.stage === 'research' ? 1 : 2;
  const clock = `${Math.floor(Math.ceil(remaining/1000)/60).toString().padStart(2,'0')}:${(Math.ceil(remaining/1000)%60).toString().padStart(2,'0')}`;

  return <div className="site-shell">
    <header className="site-header"><a href={appUrl('/')} onClick={e => { e.preventDefault(); reset(); }} className="brand" aria-label="每日开讲首页"><span className="brand-icon"><AudioLines size={23}/></span><span>每日开讲<span className="brand-sub">DAILY SPEAKING</span></span></a><button className="quiet-button" onClick={() => setShowHistory(true)}><History size={17}/><span>练习足迹</span>{records.length > 0 && <span className="badge">{records.length}</span>}</button></header>
    <main>
      <div className="journey" aria-label="练习步骤">{['遇见一个词','花十分钟理解','用自己的声音讲述'].map((step,i) => <div key={step} className={`journey-item ${activeStep===i?'active':''} ${activeStep>i?'past':''}`}><span className="step-dot">{activeStep>i ? <Check size={12}/> : `0${i+1}`}</span><span>{step}</span>{i<2 && <span className="step-line"/>}</div>)}</div>
      {storageWarning && <p className="notice" role="status">{storageWarning}</p>}
      {!session ? <p className="loading-initial">正在打开你的练习空间…</p> : <>
      {session.stage === 'choose' && <>
        <section className="hero"><div className="eyebrow"><span/> A LITTLE PRACTICE, EVERY DAY</div><h1>让知识，成为<span>你的表达。</span></h1><p>一个词，十分钟探索，几分钟开讲。<br/>在每天的小小练习里，慢慢找到从容表达的自己。</p><div className="hero-note"><Clock3 size={15}/> 约 15 分钟 <span>·</span> 无需准备 <span>·</span> 从好奇开始</div></section>
        <section className="category-section"><div className="section-label"><h2>今天，想探索哪个领域？</h2><span>选一个方向，把剩下的交给好奇心</span></div><div className="category-grid">{categories.map(c => { const Icon=icons[c.icon]; const selected=session.category===c.id; return <button className={`category-card ${selected?'selected':''}`} aria-pressed={selected} key={c.id} onClick={() => setSession({...session,category:c.id})} disabled={!!busy}><div className="category-top"><span className="category-icon"><Icon size={26} strokeWidth={1.4}/></span><span className="radio-dot">{selected && <span/>}</span></div><div className="category-en">{c.en}</div><h3>{c.name}</h3><p>{c.desc}</p><div className="category-sample">{c.sample}</div></button>; })}</div><div className="draw-area"><button className="primary draw-button" onClick={draw} disabled={!!busy}><Shuffle size={18}/> 抽取今日关键词 <ArrowRight size={18}/></button><p>不需要懂很多，愿意开始就很好。</p></div></section>
        <section className="how-it-works"><div><span className="mini-icon"><Shuffle size={19}/></span><h3>从一个词开始</h3><p>随机遇见一个概念<br/>给好奇心一个新方向</p></div><div><span className="mini-icon"><BookOpen size={19}/></span><h3>留十分钟给理解</h3><p>跟着研究材料探索<br/>把陌生的知识变熟悉</p></div><div><span className="mini-icon"><AudioLines size={19}/></span><h3>把理解说出来</h3><p>借助讲解稿与提纲<br/>用 3–5 分钟练习表达</p></div></section>
      </>}

      {session.stage === 'topic' && <section className="topic-stage"><button className="back-link" disabled={!!busy} onClick={() => reset()}><ChevronLeft size={16}/> 重新选择领域</button><div className="eyebrow">TODAY’S DISCOVERY · {category.name}</div><p className="soft-label">今天，来认识一下</p><h1>{session.topic?.word}</h1><p className="topic-intro">{session.topic?.intro}</p><div className="topic-divider"/><p className="topic-description">接下来，我们会为你准备一份研究材料。<br/>不用急着记住每一句，先试着理解它。</p><div className="button-row centered"><button className="secondary" disabled={!!busy} onClick={draw}><Shuffle size={17}/> 换一个词</button><button className="primary" disabled={!!busy} onClick={research}>准备研究材料 <ArrowRight size={17}/></button></div></section>}

      {(session.stage === 'research' || session.stage === 'speech') && <section className="workspace"><div className="workspace-heading"><span className="eyebrow">{category.name} / {session.stage==='research'?'EXPLORE':'SPEAK'}</span><h1>{session.topic?.word}</h1><p>{session.stage==='research'?'先理解，再用自己的话表达。':'把刚刚理解的知识，讲给一个好奇的朋友听。'}</p></div><div className="reading-layout"><article className="paper">
        {session.stage === 'research' ? <><div className="paper-label"><BookOpen size={16}/> 十分钟研究笔记</div>{session.research?.sections.map((section,i) => <section className="reading-section" key={i}><h2><span>{String(i+1).padStart(2,'0')}</span>{section.title}</h2><p>{section.body}</p></section>)}<section className="self-check"><h2>停一下，问问自己</h2>{session.research?.questions.map((q,i) => <p key={i}><span>{i+1}.</span> {q}</p>)}</section></> : <><div className="script-toolbar"><span className="paper-label"><AudioLines size={16}/> {session.minutes} 分钟讲解稿</span><div className="segmented">{(['full','outline','hidden'] as const).map((v,i) => <button key={v} aria-pressed={view===v} className={view===v?'chosen':''} onClick={() => setView(v)}>{['全文','提纲','隐藏'][i]}</button>)}</div></div>{view==='full' ? session.speech?.paragraphs.map((p,i) => <p className="script-paragraph" key={i}>{p}</p>) : view==='outline' ? <ol className="outline">{session.speech?.outline.map((p,i) => <li key={i}>{p}</li>)}</ol> : <div className="hidden-script"><AudioLines size={44} strokeWidth={1}/><h2>现在，是你的声音。</h2><p>不用逐字复述，把你理解的说出来就好。</p></div>}<details className="research-reference"><summary>回看研究材料</summary>{session.research?.sections.map((s,i) => <section key={i}><h3>{s.title}</h3><p>{s.body}</p></section>)}</details></>}
        <div className="ai-note">内容由 AI 生成，供理解与表达练习使用。</div>
      </article><aside className="practice-sidebar"><div className="timer-card"><span className="eyebrow">{session.stage==='research'?'理解时间':'开讲时间'}</span><div className="clock" role="timer" aria-label="剩余时间">{clock}</div><div className="timer-track"><span style={{width:`${remaining/(session.stage==='research'?600000:session.minutes*60000)*100}%`}}/></div><p>{!session.timer.started ? (session.stage==='research'?'材料已就绪，准备好再开始。':'先熟悉稿件，准备好了就开讲。') : remaining===0 ? '研究时间到了，可以准备开讲了。' : session.timer.deadline===null ? '休息一下，随时可以继续。' : '专注当下，慢慢来。'}</p>{remaining>0 && <button className="primary full-width" onClick={toggleTimer} disabled={!!busy}>{session.timer.deadline!==null ? <Pause size={16}/> : <Play size={16}/>} {session.timer.deadline!==null?'暂停':session.timer.started?'继续':session.stage==='research'?'开始研究':'开始讲解'}</button>}
        {session.stage==='research' && <><div className="sidebar-divider"/><label className="duration-label">接下来，讲多久？</label><div className="duration-picker">{([3,4,5] as const).map(m => <button key={m} disabled={!!busy} aria-pressed={session.minutes===m} className={session.minutes===m?'chosen':''} onClick={() => setSession({...session,minutes:m})}>{m} 分钟</button>)}</div><button className="secondary full-width" disabled={!!busy} onClick={makeSpeech}>{remaining===0?'生成讲解稿':'我理解了，准备开讲'}<ArrowRight size={15}/></button></>}
        </div><div className="gentle-note"><Leaf size={19}/><p>{session.stage==='research'?'不必记住所有细节。能解释清楚一个核心想法，就是收获。':'允许停顿，也允许不完美。每一次开口，都在积累从容。'}</p></div></aside></div></section>}

      {session.stage === 'done' && <section className="done-stage"><div className="completion-mark"><Check size={32}/></div><div className="eyebrow">A SMALL STEP FORWARD</div><h1>又多了一点，<span>表达的底气。</span></h1><p>你为「{session.topic?.word}」完成了 {session.minutes} 分钟计时练习。<br/>谢谢你，给了自己的声音一点时间。</p><div className="button-row centered"><button className="secondary" onClick={() => { setSession({...session,id:createSessionId(),stage:'speech',timer:emptyTimer(session.minutes*60000)}); setView('full'); }}><RotateCcw size={16}/> 再练一次</button><button className="primary" onClick={() => reset()}>探索下一个词 <ArrowRight size={17}/></button></div><button className="back-link" onClick={() => setShowHistory(true)}>看看我的练习足迹 <ArrowUpRight size={15}/></button></section>}
      </>}
      {busy && <div className="request-status" role="status"><span className="spinner"/>{busy}</div>}
      {error && <div className="error-message" role="alert">{error}<button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16}/></button></div>}
    </main>
    <footer><span>每日开讲 <span className="footer-dot">·</span> 给表达一点时间</span><span>保持好奇，慢慢生长 <Leaf size={13}/></span></footer>
    {showHistory && <div className="modal-backdrop" onClick={() => setShowHistory(false)}><section className="history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if(e.key==='Escape')setShowHistory(false); }}><div className="modal-heading"><h2 id="history-title">练习足迹</h2><button autoFocus className="icon-button" aria-label="关闭练习足迹" onClick={() => setShowHistory(false)}><X size={20}/></button></div><p className="history-note">最近 30 次练习，保存在当前浏览器。</p>{records.length===0 ? <div className="history-empty"><Leaf size={32} strokeWidth={1}/><p>第一段足迹，等你开口后留下。</p></div> : <ul className="history-list">{records.map(r => <li key={r.id}><div><strong>{r.word}</strong><span>{categories.find(c => c.id===r.category)?.name}</span></div><div><span>{r.minutes} 分钟</span><time>{new Date(r.date).toLocaleDateString('zh-CN')}</time></div></li>)}</ul>}</section></div>}
  </div>;
}
