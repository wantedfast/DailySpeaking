import { defineConfig } from '@playwright/test';
const knowledgeDirectory = `./data/e2e-knowledge-${Date.now()}`;
export default defineConfig({
  testDir:'./e2e',fullyParallel:false,workers:1,timeout:45000,
  use:{baseURL:'http://127.0.0.1:3100',headless:true,screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --port 3100',url:'http://127.0.0.1:3100',reuseExistingServer:false,timeout:120000,env:{MOCK_AI:'true',ADMIN_PASSWORD:'e2e-test-only-password',KNOWLEDGE_DIR:knowledgeDirectory,RATE_LIMIT_PER_MINUTE:'500',RATE_LIMIT_PER_DAY:'1000',RATE_LIMIT_GLOBAL_PER_DAY:'2000',SQLITE_PATH:'./data/e2e-quotas.sqlite'}},
});
