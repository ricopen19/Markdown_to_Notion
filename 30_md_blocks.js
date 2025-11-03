function mdToNotionBlocks(md) {
  const lines = md.split(/\r?\n/);
  const children = [];

  let inCode = false, codeLang = '', buf = [];
  let inEqBlock = false, eqBuf = [];

  // list state（単純な連続行を同じタイプのリストとしてまとめる）
  let listMode = null; // 'bullet' | 'number' | 'todo'
  let listBuffer = [];

  const flushList = () => {
    if (!listMode || listBuffer.length === 0) { listMode = null; listBuffer = []; return; }
    for (const item of listBuffer) {
      if (listMode === 'bullet') {
        children.push({ object: 'block', type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: convertInlineLatexToRich(item) }});
      } else if (listMode === 'number') {
        children.push({ object: 'block', type: 'numbered_list_item',
          numbered_list_item: { rich_text: convertInlineLatexToRich(item) }});
      } else if (listMode === 'todo') {
        const checked = /^\s*-\s*\[x\]\s+/i.test(item);
        const text = item.replace(/^\s*-\s*\[[ xX]\]\s+/, '');
        children.push({ object: 'block', type: 'to_do',
          to_do: { checked, rich_text: convertInlineLatexToRich(text) }});
      }
    }
    listMode = null; listBuffer = [];
  };

  const pushHeading = (text, level) => {
    const key = `heading_${level}`;
    children.push({ object: 'block', type: key, [key]: { rich_text: convertInlineLatexToRich(text) } });
  };
  const pushParagraph = (text) => {
    children.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: text ? convertInlineLatexToRich(text) : [] } });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // code fence
    const start = line.match(/^```(\w+)?\s*$/);
    if (!inCode && start) { flushList(); inCode = true; codeLang = (start[1] || '').toLowerCase(); buf = []; continue; }
    if (inCode && FENCE_END.test(line)) {
      const code = buf.join('\n');
      if (codeLang === 'mermaid') {
        const url = `${MERMAID_WEBAPP_BASE}?code=${encodeURIComponent(code)}`;
        children.push({ object: 'block', type: 'embed', embed: { url } });
      } else {
        children.push({ object: 'block', type: 'code', code: { language: codeLang || 'plain text', rich_text: [{ type: 'text', text: { content: code } }] } });
      }
      inCode = false; codeLang = ''; buf = []; continue;
    }
    if (inCode) { buf.push(line); continue; }

    // 行全体が **...** の太字段落（前後の空白は許容）
    const boldLine = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    if (boldLine) {
      flushList();

      // 1) 中身をインラインMarkdown/LaTeXとして分解
      const rich = convertInlineLatexToRich(boldLine[1])
        // 2) text ノードだけ太字付与（equation 等はそのまま）
        .map(n => {
          if (n.type === 'text') {
            return {
              ...n,
              annotations: { ...(n.annotations || {}), bold: true }
            };
          }
          return n;
        });

      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: rich }
      });
      continue;
    }

    // equation block $$ ... $$
    // LaTeX ブロック：$$ で開始/終了
    if (!inEqBlock && /^\s*\$\$\s*$/.test(line)) {
      inEqBlock = true;
      eqBuf = [];
      continue;
    }

    // ✅ 追加: 同一行の $$...$$ を検出して直接 equation ブロック化
    const singleLineEq = line.match(/^\s*\$\$([\s\S]+?)\$\$\s*$/);
    if (singleLineEq) {
      const expr = singleLineEq[1].trim();
      if (expr) {
        children.push({
          object: 'block',
          type: 'equation',
          equation: { expression: expr }
        });
      }
      continue;
    }

    if (inEqBlock) {
      if (/^\s*\$\$\s*$/.test(line)) {
        const expr = eqBuf.join('\n').trim();
        if (expr)
          children.push({
            object: 'block',
            type: 'equation',
            equation: { expression: expr }
          });
        inEqBlock = false;
        eqBuf = [];
        continue;
      }
      eqBuf.push(line);
      continue;
    }


    // quote
    if (/^\s*>\s+/.test(line)) {
      flushList();
      const text = line.replace(/^\s*>\s+/, '');
      children.push({ object: 'block', type: 'quote', quote: { rich_text: convertInlineLatexToRich(text) } });
      continue;
    }

    // …（inCode / inEqBlock / quote / list 判定の直後あたりに）
    // Table 検出（連続する |...| 行）
    if (TABLE_ROW_REGEX.test(line)) {
      flushList();
      const { used, block } = parseTableAt(lines, i);
      if (block) children.push(block);
      i += (used - 1); // 使った行数ぶん進める（for の i++ と合わせる）
      continue;
    }

    // to-do (checkbox)
    if (/^\s*-\s*\[[ xX]\]\s+/.test(line)) {
      const mode = 'todo';
      if (listMode && listMode !== mode) flushList();
      listMode = mode; listBuffer.push(line);
      continue;
    }

    // bullet
    if (/^\s*-\s+/.test(line)) {
      const mode = 'bullet';
      if (listMode && listMode !== mode) flushList();
      listMode = mode; listBuffer.push(line.replace(/^\s*-\s+/, ''));
      continue;
    }

    // numbered
    if (/^\s*\d+\.\s+/.test(line)) {
      const mode = 'number';
      if (listMode && listMode !== mode) flushList();
      listMode = mode; listBuffer.push(line.replace(/^\s*\d+\.\s+/, ''));
      continue;
    }

    // YouTube
    const m = line.match(YT_REGEX);
    if (m) { flushList(); children.push({ object: 'block', type: 'video', video: { external: { url: m[0] } } }); continue; }

    // headings
    if (/^#\s+/.test(line))   { flushList(); pushHeading(line.replace(/^#\s+/, ''), 1); continue; }
    if (/^##\s+/.test(line))  { flushList(); pushHeading(line.replace(/^##\s+/, ''), 2); continue; }
    if (/^###\s+/.test(line)) { flushList(); pushHeading(line.replace(/^###\s+/, ''), 3); continue; }

    // blank line → 区切りとしてリストをフラッシュ
    if (/^\s*$/.test(line)) { flushList(); pushParagraph(''); continue; }

    // paragraph
    flushList();
    pushParagraph(line);
  }

  // 最後のリストを吐き出す
  flushList();

  return children;
}


function parseTableAt(lines, startIdx) {
  const rows = [];
  let i = startIdx;

  // 1) 連続するテーブル行を収集
  while (i < lines.length && TABLE_ROW_REGEX.test(lines[i])) {
    rows.push(lines[i]);
    i++;
  }
  if (rows.length === 0) return { used: 0, block: null };

  // 2) アラインメント行でヘッダ判定
  let header = false;
  let dataRows = rows.slice();
  if (rows.length >= 2 && TABLE_ALIGN_REGEX.test(rows[1])) {
    header = true;
    dataRows = rows.slice(2); // 0:ヘッダ, 1:アラインメントを除外した残り
  }

  // 3) セル分割（\| エスケープ対応）
  const splitCells = (line) => {
    let parts = line.split(SPLIT_PIPE_REGEX).map(s => s.trim());
    if (parts.length && parts[0] === '') parts.shift();
    if (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts.map(c => c.replace(/\\\|/g, '|'));
  };

  const headerCells = header ? splitCells(rows[0]) : null;
  const firstCells  = splitCells(dataRows[0] || '');
  const width = Math.max(
    header && headerCells ? headerCells.length : 0,
    firstCells.length,
    1
  );

  const toRichCell = (cell) => {
    const trimmed = cell.trim();
    const blockEq = trimmed.match(/^\$\$([\s\S]+?)\$\$$/);
    if (blockEq) {
      const expr = blockEq[1].trim();
      if (expr) {
        return [{ type: 'equation', equation: { expression: expr } }];
      }
    }
    return convertInlineLatexToRich(cell);
  };

  // 4) 各行を rich_text に変換
  const rowPayloads = [];
  if (header && headerCells) {
    rowPayloads.push({ isHeader: true, cells: headerCells.map(c => toRichCell(c)) });
  }
  for (let r = 0; r < dataRows.length; r++) {
    const cells = splitCells(dataRows[r]);
    while (cells.length < width) cells.push('');
    const rt = cells.slice(0, width).map(c => toRichCell(c));
    rowPayloads.push({ isHeader: false, cells: rt });
  }

  // ★ フォールバック用に生テキストも保持
  const rawSource = rows.join('\n');

  // 5) tableブロック（プレースホルダとして返す）
  const block = {
    object: 'block',
    type: 'table',
    table: {
      table_width: width,
      has_column_header: !!(header && headerCells),
      has_row_header: false
    },
    __rows: rowPayloads,
    __raw: rawSource  // ← fallback用生テキスト
  };

  return { used: i - startIdx, block };
}
