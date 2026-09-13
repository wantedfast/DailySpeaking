// Next.js embeds this public, non-secret prefix at build time.
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const appUrl = (path: string) => `${basePath}${path}`;
