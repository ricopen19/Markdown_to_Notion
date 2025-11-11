// 追加ヘルパー：エスケープ済み $ を復元
function restoreEscapedDollar(s) {
  return s.replace(new RegExp(ESCAPED_DOLLAR_PLACEHOLDER, 'g'), '$');
}

function convertMarkdownInlineToRich(text) {
  const out = [];
  let cursor = 0;

  // まずリンクを分割
  const parts = [];
  let match;
  MD_LINK_REGEX.lastIndex = 0;
  while ((match = MD_LINK_REGEX.exec(text)) !== null) {
    if (match.index > cursor) parts.push({ type: 'text', value: text.slice(cursor, match.index) });
    parts.push({ type: 'link', label: match[1], url: match[2] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push({ type: 'text', value: text.slice(cursor) });

  // 太字・斜体・リンクを Notion rich_text に変換
  for (const p of parts) {
    if (p.type === 'link') {
      out.push({
        type: 'text',
        text: { content: restoreEscapedDollar(p.label), link: { url: p.url } }
      });
      continue;
    }

    let segment = p.value;
    let last = 0;
    MD_BOLD_REGEX.lastIndex = 0;
    const boldSplit = [];

    while ((match = MD_BOLD_REGEX.exec(segment)) !== null) {
      if (match.index > last) boldSplit.push({ kind: 'plain', text: segment.slice(last, match.index) });
      boldSplit.push({ kind: 'bold', text: match[1] });
      last = match.index + match[0].length;
    }
    if (last < segment.length) boldSplit.push({ kind: 'plain', text: segment.slice(last) });

    for (const b of boldSplit) {
      // 旧：太字をそのまま text ノードで push していた部分を差し替え
      if (b.kind !== 'plain') {
        const rawSegments = convertInlineLatexToRich(b.text);
        const richBold = rawSegments.map(n => {
          if (n.type === 'text') {
            return {
              ...n,
              annotations: { ...(n.annotations || {}), bold: true }
            };
          }
          if (n.type === 'equation') {
            const expression = n.equation?.expression || '';
            return {
              type: 'rich_text',
              rich_text: [{
                type: 'text',
                text: { content: '$' },
                annotations: { bold: true }
              }, {
                type: 'equation',
                equation: { expression }
              }, {
                type: 'text',
                text: { content: '$' },
                annotations: { bold: true }
              }]
            };
          }
          return n;
        });
        for (const item of richBold) {
          if (item.type === 'rich_text') {
            if (Array.isArray(item.rich_text)) {
              for (const inner of item.rich_text) out.push(inner);
            }
          } else {
            out.push(item);
          }
        }
      } else {
        // （この下の斜体処理はそのまま残す）
        let iLast = 0; MD_ITALIC_REGEX.lastIndex = 0;
        while ((match = MD_ITALIC_REGEX.exec(b.text)) !== null) {
          if (match.index > iLast) {
            out.push({
              type: 'text',
              text: { content: restoreEscapedDollar(b.text.slice(iLast, match.index)) }
            });
          }
          out.push({
            type: 'text',
            text: { content: restoreEscapedDollar(match[1]) },
            annotations: { italic: true }
          });
          iLast = match.index + match[0].length;
        }
        if (iLast < b.text.length) {
          out.push({
            type: 'text',
            text: { content: restoreEscapedDollar(b.text.slice(iLast)) }
          });
        }
      }
    }
  }

  return out;
}



function convertInlineLatexToRich(mixedText) {
  // \$ を退避
  const safe = mixedText.replace(/\\\$/g, ESCAPED_DOLLAR_PLACEHOLDER);

  const segments = [];
  let last = 0; let m;

  INLINE_TEX_REGEX.lastIndex = 0;
  while ((m = INLINE_TEX_REGEX.exec(safe)) !== null) {
    if (m.index > last) segments.push({ kind: 'text', value: safe.slice(last, m.index) });
    segments.push({ kind: 'tex', value: m[1] }); // 中身のみ（$は除去済み）
    last = m.index + m[0].length;
  }
  if (last < safe.length) segments.push({ kind: 'text', value: safe.slice(last) });

  const rich = [];
  for (const s of segments) {
    if (s.kind === 'tex') {
      const expr = s.value.trim();
      // 空 or `$` 混入は危険 → テキストとしてそのまま返す
      if (!expr || expr.includes('$')) {
        const raw = restoreEscapedDollar(`$${s.value}$`);
        const rt = convertMarkdownInlineToRich(raw); // 普通のテキストに戻す
        for (const r of rt) rich.push(r);
      } else {
        rich.push({ type: 'equation', equation: { expression: expr } });
      }
    } else {
      const rt = convertMarkdownInlineToRich(s.value);
      for (const r of rt) rich.push(r);
    }
  }
  return rich;
}
