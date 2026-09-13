import { categoryNames } from './schemas';
const words = { accounting: ['机会成本', '现金流', '复利'], ai: ['机器学习', '过拟合', '神经网络'], computing: ['缓存', '二进制', '算法'], nature: ['光合作用', '水循环', '生态位'], hr: ['胜任力', '绩效管理', '员工激励'] };
export function mockTopic(category: keyof typeof categoryNames, recent: string[]) {
  const candidates = words[category];
  const word = candidates.find(item => !recent.includes(item)) || candidates[(recent.length + 1) % candidates.length];
  return { word, intro: `从生活里的例子出发，认识${word}，试着用自己的话把它讲清楚。` };
}
export function mockResearch(word: string) {
  return { sections: ['核心定义', '它如何运作', '生活中的具体例子', '常见误解', '要点总结', '把知识讲给别人听'].map((title, i) => ({ title, body: `这是用于验收界面与流程的模拟研究材料，不是${word}的正式知识解释。配置 DeepSeek Key 并关闭 MOCK_AI 后，系统会为你生成完整的研究文档。\n\n${['先用一句话给概念下定义，再指出它解决什么问题。好的定义既简洁，也让听众能在脑海里形成画面。', '把复杂过程分成三个步骤：起点发生了什么，中间如何变化，最后得到了什么。明确每一步之间的关系。', '从熟悉的日常场景开始：学习、购物、做饭或使用手机。用一个具体的人和一个具体的问题，呈现概念的作用。', '区分概念本身和人们对它的直觉。检查是否把相关性当成因果，是否把单个例子推广到了所有情形。', '合上材料，用自己的话说出三个关键点。如果某个点还讲不清楚，回到对应段落，找出最简单的解释。', '开头提出一个小问题，中间讲清楚一个例子，最后用一句话回扣主题。允许停顿，理解比背诵更重要。'][i]}` })), questions: ['这个概念试图解释什么？', '你能举一个自己的例子吗？', '最容易产生的误解是什么？'] };
}
export function mockSpeech(word: string, minutes: number) {
  const base = [
    `大家好，今天我想和你聊聊“${word}”。这是模拟演讲稿，用于体验${minutes}分钟的练习流程。正式生成的讲解稿会根据你刚才阅读的研究材料，给出这个概念的准确解释。`,
    '面对一个陌生概念，我们不必急着记住所有术语。可以先问：它是什么？它为什么值得了解？它能帮助我们解释生活中的哪种现象？这三个问题就像一张小地图，让学习有一个清楚的方向。',
    '接下来，我们用一个熟悉的场景来帮助听众理解。一个好的例子应该有人、有具体的问题，也有可以观察的结果。讲完例子以后，再回到概念，说明它与刚才的故事有什么联系。',
    '最后，试着用自己的话总结。讲解不需要追求每句话都完美，停顿和重新组织都很正常。当我们能够用简单的语言说清楚一个知识点，就迈出了从理解到表达的一步。谢谢大家。',
  ];
  return { paragraphs: base, outline: [`引入：今天的主题是${word}`, '解释：定义、问题、作用', '例子：场景、过程、结果', '总结：用一句自己的话收尾'] };
}
