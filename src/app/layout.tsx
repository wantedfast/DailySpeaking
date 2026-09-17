import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { appUrl } from '@/lib/url';
import './globals.css';
import './polish.css';
import './apple.css';
import './knowledge.css';
export const metadata: Metadata = { title: '每日开讲 · 让知识成为你的表达', description: '一个词，十分钟探索，几分钟开讲。每天给表达一点练习。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body style={{ '--glass-background': `url("${appUrl('/glass-background.png')}")` } as CSSProperties}>{children}</body></html>; }
