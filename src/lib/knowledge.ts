import { z } from 'zod';

export const documentSourceSchema = z.object({ id: z.string().uuid(), name: z.string().max(240) });
export const citationSchema = z.object({ chunkId: z.number().int().positive(), label: z.string().max(100), text: z.string().max(2000) });
export type DocumentSource = z.infer<typeof documentSourceSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type DocumentInfo = DocumentSource & {
  format: 'pdf' | 'docx'; size: number; createdAt: string;
  status: 'processing' | 'ready' | 'failed'; error: string | null; characters: number;
};
export type DocumentDetail = DocumentInfo & { chunks: Citation[] };
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
