import JSZip from 'jszip';
export const sourceText = '知识管理是组织和保存资料的方法。知识管理通过分类、检索和复习帮助学习。学习者可以把文档中的概念用自己的话讲出来。';
export async function docxFixture(text = sourceText) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml',`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text.split('\n\n').map(p=>`<w:p><w:r><w:t>${p.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
  return zip.generateAsync({type:'nodebuffer'});
}
// Tiny real PDF with an embedded Unicode character map; no machine-local fonts needed.
export function pdfFixture(pages = [sourceText]) {
  const characters = [...new Set(pages.join('').split(''))];
  const hex = (n:number)=>n.toString(16).padStart(4,'0');
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /TestUnicode def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange ${characters.length} beginbfchar ${characters.map((c,i)=>`<${hex(i+1)}> <${hex(c.charCodeAt(0))}>`).join('\n')} endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
  const stream = (s:string) => `<< /Length ${Buffer.byteLength(s)} >>\nstream\n${s}\nendstream`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${7+i*2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /TestFont /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TestFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 1000 >>',
    '<< /Type /FontDescriptor /FontName /TestFont /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>',
    stream(cmap),
  ];
  for (const [i,text] of pages.entries()) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 2000 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${8+i*2} 0 R >>`);
    objects.push(stream(`BT /F1 12 Tf 20 700 Td <${text.split('').map(c=>hex(characters.indexOf(c)+1)).join('')}> Tj ET`));
  }
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${value}\nendobj\n`;});
  const xref = Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
