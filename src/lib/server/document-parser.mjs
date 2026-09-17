// Executed in an isolated worker; also copied into standalone releases.
import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const maxCharacters = 1_000_000;
const chunks = [];
let characters = 0;
function append(text, label) {
  text = text.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return;
  characters += text.length;
  if (characters > maxCharacters) throw new Error('文档文字超过 100 万字符，请拆分后上传。');
  for (const paragraph of text.split(/\n\s*\n/)) {
    for (let offset = 0; offset < paragraph.length; offset += 1600) {
      const value = paragraph.slice(offset, offset + 1600).trim();
      if (value) chunks.push({ chunkId: chunks.length + 1, label, text: value });
    }
  }
}
async function validateDocx(path) {
  const yauzl = require('yauzl');
  await new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(new Error('Word 文件损坏或无法读取。'));
      let total = 0, entries = 0, main = false;
      const fail = message => { zip.close(); reject(new Error(message)); };
      zip.on('error', () => fail('Word 文件损坏或无法读取。'));
      zip.on('entry', entry => {
        total += entry.uncompressedSize; entries++;
        if (total > 80 * 1024 * 1024 || entry.uncompressedSize > 20 * 1024 * 1024 || entries > 5000) return fail('Word 解压后内容过大，请拆分后上传。');
        if (entry.generalPurposeBitFlag & 1) return fail('暂不支持加密 Word，请解密后上传。');
        if (entry.fileName === 'word/document.xml') main = true;
        zip.readEntry();
      });
      zip.on('end', () => main ? resolve() : reject(new Error('文件不是有效的 DOCX 文档。')));
      zip.readEntry();
    });
  });
}
try {
  if (workerData.format === 'pdf') {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfDirectory = dirname(require.resolve('pdfjs-dist/package.json'));
    const task = getDocument({ data: new Uint8Array(await readFile(workerData.path)), isEvalSupported: false, useSystemFonts: true, verbosity: 0,
      cMapUrl: join(pdfDirectory, 'cmaps').replaceAll('\\', '/') + '/', cMapPacked: true,
      standardFontDataUrl: join(pdfDirectory, 'standard_fonts').replaceAll('\\', '/') + '/',
      wasmUrl: join(pdfDirectory, 'wasm').replaceAll('\\', '/') + '/', useWorkerFetch: false,
    });
    let document;
    try {
      document = await task.promise;
      if (document.numPages > 500) throw new Error('PDF 超过 500 页，请拆分后上传。');
      for (let i = 1; i <= document.numPages; i++) {
        const page = await document.getPage(i);
        const content = await page.getTextContent();
        let text = '';
        for (const item of content.items) {
          if (!('str' in item)) continue;
          if (text && !/\s$/.test(text) && item.str && !/^\s/.test(item.str) && !(/[\p{Script=Han}]$/u.test(text) && /^[\p{Script=Han}]/u.test(item.str))) text += ' ';
          text += item.str + (item.hasEOL ? '\n' : '');
        }
        append(text, `第 ${i} 页`);
        page.cleanup();
      }
    } finally { await task.destroy(); }
  } else {
    const header = (await readFile(workerData.path)).subarray(0,8);
    if (header.equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))) throw new Error('暂不支持加密或旧版 Word，请解密并另存为 DOCX 后上传。');
    await validateDocx(workerData.path);
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ path: workerData.path }, { externalFileAccess: false });
    result.value.split(/\n\s*\n/).forEach((text, i) => append(text, `第 ${i+1} 段`));
  }
  if (characters < 20) throw new Error('未提取到足够文字。扫描 PDF 请先进行 OCR，再上传文字版文件。');
  parentPort.postMessage({ chunks });
} catch (error) {
  const known = /^(文档文字|Word |暂不支持|文件不是|PDF 超过|未提取)/;
  const message = error?.name === 'PasswordException' ? '暂不支持加密 PDF，请解密后上传。' : known.test(error?.message || '') ? error.message : '文档损坏或解析失败，请检查文件后重新上传。';
  parentPort.postMessage({ error: message });
}
