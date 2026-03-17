const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

export function measureTextWidth(text, fontFamily, fontSize, featureTag, fontWeight) {
  ctx.font = `${fontWeight || '400'} ${fontSize}px "${fontFamily}", sans-serif`;
  const metrics = ctx.measureText(text || '');
  return metrics.width;
}

function wrapToLinesSingleParagraph(text, maxWidth, fontFamily, fontSize, featureTag, fontWeight) {
  if (!text) return [];
  const words = text.trim().split(/\s+/);
  const lines = [];
  let line = '';
  const width = (s) => measureTextWidth(s, fontFamily, fontSize, featureTag, fontWeight);

  const breakLongWord = (word) => {
    const out = []; let cur = '';
    for (const ch of word) {
      const test = cur + ch;
      if (width(test) > maxWidth && cur) { out.push(cur); cur = ch; }
      else { cur = test; }
    }
    if (cur) out.push(cur);
    return out;
  };

  for (let i=0;i<words.length;i++){
    let w = words[i];
    if (width(w) > maxWidth) {
      const chunks = breakLongWord(w);
      words.splice(i,1,...chunks);
      w = words[i];
    }
    const test = line ? `${line} ${w}` : w;
    if (width(test) > maxWidth && line) { lines.push(line); line = w; }
    else { line = test; }
  }
  if (line) lines.push(line);
  return lines;
}

export function wrapWithHardBreaks(text, maxWidth, fontFamily, fontSize, featureTag, fontWeight) {
  if (text == null) return [];
  const chunks = String(text).split(/\r?\n/);
  const out = [];
  for (let i=0;i<chunks.length;i++){
    const seg = chunks[i];
    if (seg === '') { out.push(''); continue; }
    out.push(...wrapToLinesSingleParagraph(seg, maxWidth, fontFamily, fontSize, featureTag, fontWeight));
  }
  return out;
}

export function escapeXML(str){
  return (str||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}