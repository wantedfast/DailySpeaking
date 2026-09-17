import { generate } from '../../../lib/server/ai';
import { handle, mockEnabled } from '../../../lib/server/http';
import { topicInput, topicOutput, categoryNames } from '../../../lib/server/schemas';
import { mockTopic } from '../../../lib/server/fixtures';
import { documentTopic } from '../../../lib/server/document-generation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handle(request, topicInput, async input => {
    if (input.documentId) return documentTopic(input.documentId, input.recentWords);
    if (mockEnabled()) return mockTopic(input.category, input.recentWords);
    return generate(topicOutput, `从${categoryNames[input.category]}领域随机选一个适合初学者在10分钟内理解、能讲解3至5分钟的稳定基础概念。尽量不要重复recentWords。返回 JSON {"word":"简短关键词","intro":"一句话介绍"}。以下是数据：${JSON.stringify(input)}`, 500);
  });
}
