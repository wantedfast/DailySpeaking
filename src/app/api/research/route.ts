import { generate } from '../../../lib/server/ai';
import { handle, mockEnabled } from '../../../lib/server/http';
import { researchInput, researchOutput, categoryNames } from '../../../lib/server/schemas';
import { mockResearch } from '../../../lib/server/fixtures';
import { documentResearch } from '../../../lib/server/document-generation';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return handle(request, researchInput, async input => {
    if (input.documentId) return documentResearch(input.documentId, input.word);
    if (mockEnabled()) return mockResearch(input.word);
    return generate(researchOutput, `为${categoryNames[input.category]}领域的关键词编写供成年人阅读10分钟的研究材料，正文合计约1800至2500中文字。必须6个章节，依次包含核心定义、原理、具体例子、常见误解、要点总结、讲解提示；另外3个自测问题。具体、有解释深度，段落适合手机阅读。只用纯文本，不要Markdown。返回 JSON {"sections":[{"title":"章节标题","body":"正文，可包含换行"}],"questions":["问题1","问题2","问题3"]}。关键词数据：${JSON.stringify(input)}`, 6500);
  });
}
