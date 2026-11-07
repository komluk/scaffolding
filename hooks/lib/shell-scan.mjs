// shell-scan.mjs — low-level scanners for shell-words.mjs: ANSI-C $'..' decoding and quote-aware matching of
// $( ) / backticks / "..." / $[ ]. Every scanner returns the index of the closing character, or -1 when unterminated.
// Plain ESM, no dependencies.

export function ansiC(src, start) {
  let s = '';
  let i = start;
  while (i < src.length && src[i] !== "'") {
    if (src[i] !== '\\') {
      s += src[i++];
      continue;
    }
    const e = src[i + 1];
    i += 2;
    const hex = { x: 2, u: 4, U: 8 }[e];
    if (e === 'n') s += '\n';
    else if (e === 't') s += '\t';
    else if (e === 'r') s += '\r';
    else if (hex) {
      const m = new RegExp(`^[0-9a-fA-F]{1,${hex}}`).exec(src.slice(i, i + hex));
      if (m) {
        const cp = parseInt(m[0], 16);
        s += cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
        i += m[0].length;
      }
    } else if (e !== undefined && /[0-7]/.test(e)) {
      const m = /^[0-7]{0,2}/.exec(src.slice(i, i + 2));
      s += String.fromCharCode(parseInt(e + m[0], 8));
      i += m[0].length;
    } else if (e !== undefined) s += e;
  }
  return [s, i + 1, i < src.length];
}

// ---- quote-aware scanners: index of the closing character, or -1 when unterminated
export function skipBq(src, b) {
  for (let j = b + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === '`') return j;
  }
  return -1;
}
function skipDq(src, q) {
  for (let j = q + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') j++;
    else if (c === '"') return j;
    else if (c === '$' && src[j + 1] === '(') {
      j = closeParen(src, j + 1);
      if (j < 0) return -1;
    } else if (c === '`') {
      j = skipBq(src, j);
      if (j < 0) return -1;
    }
  }
  return -1;
}
/** index of the ) closing the ( at `open`, skipping quotes and escapes; -1 when unterminated */
export function closeParen(src, open) {
  let d = 0;
  for (let j = open; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') j++;
    else if (c === "'") {
      j = src.indexOf("'", j + 1);
      if (j < 0) return -1;
    } else if (c === '"') {
      j = skipDq(src, j);
      if (j < 0) return -1;
    } else if (c === '`') {
      j = skipBq(src, j);
      if (j < 0) return -1;
    } else if (c === '(') d++;
    else if (c === ')' && --d === 0) return j;
  }
  return -1;
}
export function closeBracket(src, open) {
  let d = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '[') d++;
    else if (src[j] === ']' && --d === 0) return j;
  }
  return -1;
}
