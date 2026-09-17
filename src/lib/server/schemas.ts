import { z } from 'zod';
import { citationSchema, documentSourceSchema } from '../knowledge';

export const categorySchema = z.enum(['accounting', 'ai', 'computing', 'nature', 'hr']);
export const topicInput = z.object({ category: categorySchema, documentId:z.string().uuid().optional(), recentWords: z.array(z.string().trim().min(1).max(80)).max(30).default([]) }).strict();
export const topicOutput = z.object({ word: z.string().trim().min(1).max(80), intro: z.string().trim().min(1).max(300) }).strict();
export const researchInput = z.object({ category: categorySchema, documentId:z.string().uuid().optional(), word: z.string().trim().min(1).max(80) }).strict();
export const researchOutput = z.object({ sections: z.array(z.object({ title: z.string().trim().min(1).max(80), body: z.string().trim().min(1).max(6000) }).strict()).length(6), questions: z.array(z.string().trim().min(1).max(300)).length(3) }).strict();
export const speechInput = z.object({ word: z.string().trim().min(1).max(80), research: researchOutput.extend({source:documentSourceSchema.optional(), citations:z.array(citationSchema).max(8).optional()}), minutes: z.union([z.literal(3), z.literal(4), z.literal(5)]) }).strict();
export const speechOutput = z.object({ paragraphs: z.array(z.string().trim().min(1).max(2500)).min(4).max(12), outline: z.array(z.string().trim().min(1).max(300)).min(3).max(8) }).strict();
export const categoryNames = { accounting: '会计', ai: 'AI', computing: '计算机', nature: '自然', hr: '人力资源' } as const;
