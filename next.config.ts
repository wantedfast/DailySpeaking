import type { NextConfig } from 'next';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
if (basePath && !/^\/[a-zA-Z0-9/_-]+$/.test(basePath)) throw new Error('Invalid NEXT_PUBLIC_BASE_PATH');
const config: NextConfig = { output: 'standalone', poweredByHeader: false, devIndicators: false, basePath, experimental: { cpus: 1 } };
export default config;
