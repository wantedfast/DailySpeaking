import { z } from 'zod';
import { createSessionId } from './id';
export const categories = [
  { id: 'accounting', name: '会计', en: 'ACCOUNTING', desc: '读懂数字背后的商业语言', sample: '机会成本 · 现金流 · 沉没成本', icon: 'chart' },
  { id: 'ai', name: '人工智能', en: 'ARTIFICIAL INTELLIGENCE', desc: '理解正在发生的智能变革', sample: '神经网络 · 提示词 · 机器学习', icon: 'spark' },
  { id: 'computing', name: '计算机', en: 'COMPUTER SCIENCE', desc: '探索数字世界的运行逻辑', sample: '算法 · 云计算 · 开源', icon: 'computer' },
  { id: 'nature', name: '自然', en: 'NATURE & SCIENCE', desc: '重新发现身边世界的奇妙', sample: '光合作用 · 潮汐 · 共生', icon: 'leaf' },
  { id: 'hr', name: '人力资源', en: 'HUMAN RESOURCES', desc: '理解人才与组织如何共同成长', sample: '胜任力 · 绩效管理 · 员工激励', icon: 'people' },
] as const;
export type Category = typeof categories[number]['id'];
const topicSchema = z.object({ word: z.string().max(80), intro: z.string().max(400) });
const researchSchema = z.object({ sections: z.array(z.object({ title: z.string().max(120), body: z.string().max(15000) })).max(12), questions: z.array(z.string().max(500)).max(10) });
const speechSchema = z.object({ paragraphs: z.array(z.string().max(10000)).max(20), outline: z.array(z.string().max(1000)).max(20) });
const timerSchema = z.object({ remaining: z.number().min(0).max(600000), deadline: z.number().nullable(), started: z.boolean() });
export const sessionSchema = z.object({ id: z.string(), category: z.enum(['accounting','ai','computing','nature','hr']), topic: topicSchema.nullable(), research: researchSchema.nullable(), speech: speechSchema.nullable(), minutes: z.union([z.literal(3),z.literal(4),z.literal(5)]), stage: z.enum(['choose','topic','research','speech','done']), timer: timerSchema });
export type Session = z.infer<typeof sessionSchema>;
export type Research = z.infer<typeof researchSchema>;
export type Speech = z.infer<typeof speechSchema>;
export type Topic = z.infer<typeof topicSchema>;
export type Timer = z.infer<typeof timerSchema>;
export const recordSchema = z.object({ id:z.string(), word:z.string(), category:z.string(), minutes:z.number(), date:z.string() });
export type PracticeRecord = z.infer<typeof recordSchema>;
export const emptyTimer = (ms = 600000): Timer => ({ remaining: ms, deadline: null, started: false });
export function remainingTime(timer: Timer, now: number) { return Math.max(0, timer.deadline === null ? timer.remaining : timer.deadline - now); }
export function freshSession(category: Category = 'accounting'): Session { return { id: createSessionId(), category, topic: null, research: null, speech: null, minutes: 3, stage:'choose', timer: emptyTimer() }; }
export function addRecord(records: PracticeRecord[], record: PracticeRecord) { return [record, ...records.filter(r => r.id !== record.id)].slice(0,30); }
