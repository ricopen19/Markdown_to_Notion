function createPageWithChunkAppend(title, children, meta) {
  // createPageWithChunkAppend 内の properties 構築
  const properties = { Name: { title: [{ text: { content: title } }] } };
  if (meta && meta.url) properties.URL = { url: meta.url };
  if (meta && meta.tags && meta.tags.length) {
    properties.Tags = { multi_select: meta.tags.map(name => ({ name })) };
  }

  // ★ まず空でページ作成（children を同時に送らない）
  const res = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
    method: 'post',
    headers: NOTION_HEADERS,
    payload: JSON.stringify({ parent: { database_id: DATABASE_ID }, properties }),
    muteHttpExceptions: true
  });
  const status = res.getResponseCode();
  const bodyText = res.getContentText() || '';
  if (status < 200 || status >= 300) {
    Logger.log(`❌ Notion page create failed (${status}): ${bodyText}`);
    throw new Error(`Notion page create failed (${status})`);
  }
  let data = {};
  try {
    data = JSON.parse(bodyText || '{}');
  } catch (e) {
    Logger.log(`❌ Notion page create JSON parse error: ${bodyText}`);
    throw e;
  }
  const pageId = data.id;
  if (!pageId) {
    Logger.log(`❌ Notion page id missing in response: ${bodyText}`);
    throw new Error('Notion page id missing');
  }

  // ★ その後、順次投稿（table は二段階）
  appendBlocksWithTables(pageId, children, true);

  Logger.log(`✅ Created: ${title} (${children.length} blocks)`);
}



function upsertByTitle(title, children, meta) {
  const search = UrlFetchApp.fetch('https://api.notion.com/v1/search', {
    method: 'post', headers: NOTION_HEADERS,
    payload: JSON.stringify({ query: title, filter: { value: 'page', property: 'object' } }),
    muteHttpExceptions: true
  });
  const searchStatus = search.getResponseCode();
  const searchBody = search.getContentText() || '';
  if (searchStatus < 200 || searchStatus >= 300) {
    Logger.log(`❌ Notion search failed (${searchStatus}): ${searchBody}`);
    throw new Error(`Notion search failed (${searchStatus})`);
  }
  let res = {};
  try {
    res = JSON.parse(searchBody || '{}');
  } catch (e) {
    Logger.log(`❌ Notion search JSON parse error: ${searchBody}`);
    throw e;
  }
  const hit = res.results.find(r => r.object === 'page'
    && r.properties?.Name?.title?.[0]?.plain_text === title);

  if (!hit) return createPageWithChunkAppend(title, children, meta);

  // upsertByTitle でヒット時のプロパティ更新
  if (meta && (meta.url || (meta.tags && meta.tags.length))) {
    const properties = {};
    if (meta.url) properties.URL = { url: meta.url };
    if (meta.tags && meta.tags.length) {
      properties.Tags = { multi_select: meta.tags.map(name => ({ name })) };
    }
    const resUpdate = UrlFetchApp.fetch(`https://api.notion.com/v1/pages/${hit.id}`, {
      method: 'patch', headers: NOTION_HEADERS,
      payload: JSON.stringify({ properties }), muteHttpExceptions: true
    });
    const updateStatus = resUpdate.getResponseCode();
    if (updateStatus < 200 || updateStatus >= 300) {
      Logger.log(`❌ Notion page update failed (${updateStatus}): ${resUpdate.getContentText()}`);
      throw new Error(`Notion page update failed (${updateStatus})`);
    }
  }


  appendBlocksWithTables(hit.id, children, false);
  Logger.log(`🔁 Appended: ${title} (+${children.length})`);
}



function appendBlocksWithTables(parentId, children, isPage) {
  const tableHeaders = (typeof NOTION_TABLE_HEADERS !== 'undefined' && NOTION_TABLE_HEADERS)
    ? NOTION_TABLE_HEADERS
    : NOTION_HEADERS;

  const flushNormal = (buf) => {
    if (!buf.length) return;
    const res = UrlFetchApp.fetch(`https://api.notion.com/v1/blocks/${parentId}/children`, {
      method: 'patch',
      headers: NOTION_HEADERS,
      payload: JSON.stringify({ children: buf }),
      muteHttpExceptions: true
    });
    const status = res.getResponseCode();
    if (status < 200 || status >= 300) {
      Logger.log(`❌ Notion append failed (${status}): ${res.getContentText()}`);
      throw new Error(`Notion append failed (${status})`);
    }
    buf.length = 0;
    Utilities.sleep(300);
  };

  const normalBuf = [];

  for (const b of children) {
    if (b && b.type === 'table' && Array.isArray(b.__rows)) {
      // まず通常ブロックを送る
      flushNormal(normalBuf);

      let tableId = null;
      let ok = false;

      const tableRowBlocks = b.__rows.map(r => ({
        object: 'block',
        type: 'table_row',
        table_row: { cells: r.cells }
      }));

      // 1) 新API：table.children に table_row を同梱
      if (tableHeaders !== NOTION_HEADERS) {
        const payloadNew = {
          children: [{
            object: 'block',
            type: 'table',
            table: {
              table_width: b.table.table_width,
              has_column_header: b.table.has_column_header,
              has_row_header: b.table.has_row_header,
              children: tableRowBlocks
            }
          }]
        };
        Logger.log(`🧪 table payload (new API) rows=${tableRowBlocks.length}: ${JSON.stringify(payloadNew)}`);
        try {
          const resNew = UrlFetchApp.fetch(`https://api.notion.com/v1/blocks/${parentId}/children`, {
            method: 'patch',
            headers: tableHeaders,
            payload: JSON.stringify(payloadNew),
            muteHttpExceptions: true
          });
          const statusNew = resNew.getResponseCode();
          const textNew = resNew.getContentText() || '';
          if (statusNew >= 200 && statusNew < 300) {
            const dataNew = JSON.parse(textNew || '{}');
            const createdNew = (dataNew.results && dataNew.results[0]) ? dataNew.results[0] : null;
            tableId = createdNew && createdNew.id ? createdNew.id : null;
            ok = !!tableId;
            if (!ok) Logger.log(`❌ Notion table id missing (new API): ${textNew}`);
          } else {
            Logger.log(`❌ Notion table create failed (new API ${statusNew}): ${textNew}`);
          }
        } catch (e) {
          Logger.log(`❌ Notion table create exception (new API): ${e}`);
        }
      }

      // 2) 旧API：table → table_row を段階投稿
      if (!ok) {
        Logger.log(`🧪 fallback to legacy table API rows=${tableRowBlocks.length}`);
        try {
          const res1 = UrlFetchApp.fetch(`https://api.notion.com/v1/blocks/${parentId}/children`, {
            method: 'patch',
            headers: NOTION_HEADERS,
            payload: JSON.stringify({
              children: [{ object: 'block', type: 'table', table: b.table }]
            }),
            muteHttpExceptions: true
          });
          const status1 = res1.getResponseCode();
          const text1 = res1.getContentText() || '';
          if (status1 >= 200 && status1 < 300) {
            const data1 = JSON.parse(text1 || '{}');
            const created = (data1.results && data1.results[0]) ? data1.results[0] : null;
            tableId = created && created.id ? created.id : null;
            ok = !!tableId;
            if (!ok) {
              Logger.log(`❌ Notion table id missing: ${text1}`);
            }
          } else {
            Logger.log(`❌ Notion table create failed (${status1}): ${text1}`);
          }
        } catch (e) {
          Logger.log(`❌ Notion table create exception: ${e}`);
        }

        if (ok) {
          try {
            for (let i = 0; i < tableRowBlocks.length; i += 100) {
              const chunk = tableRowBlocks.slice(i, i + 100);
              const resRows = UrlFetchApp.fetch(`https://api.notion.com/v1/blocks/${tableId}/children`, {
                method: 'patch',
                headers: NOTION_HEADERS,
                payload: JSON.stringify({ children: chunk }),
                muteHttpExceptions: true
              });
              const statusRows = resRows.getResponseCode();
              if (statusRows < 200 || statusRows >= 300) {
                Logger.log(`❌ Notion table row append failed (${statusRows}): ${resRows.getContentText()}`);
                ok = false;
                break;
              }
              Utilities.sleep(300);
            }
          } catch (e) {
            Logger.log(`❌ Notion table row append exception: ${e}`);
            ok = false;
          }
        }
      }

      // ★ 失敗したら Markdown のまま code ブロックでフォールバック
      if (!ok) {
        Logger.log('⚠️ Table fallback to code block.');
        normalBuf.push({
          object: 'block',
          type: 'code',
          code: { language: 'markdown', rich_text: [{ type: 'text', text: { content: b.__raw || '' } }] }
        });
      }
      continue;
    }

    // 通常ブロック
    normalBuf.push(b);
    if (normalBuf.length >= 90) flushNormal(normalBuf);
  }

  flushNormal(normalBuf);
}



function hasFrontMatterNotionTrue(md) {
  const fm = extractFrontMatter(md);
  if (!fm) return false;
  const parsed = parseFrontMatterContent(fm.format, fm.content);
  return !!parsed.notion;
}



function parseFrontMatter(md) {
  const fm = extractFrontMatter(md);
  if (!fm) return { body: md, url: null, tags: [], notion: false, synced: false };

  const parsed = parseFrontMatterContent(fm.format, fm.content);
  const url = parsed.url ? String(parsed.url).trim() : null;
  const tags = Array.from(new Set((parsed.tags || []).map(t => String(t).trim()).filter(Boolean)));

  return { body: fm.body, url, tags, notion: !!parsed.notion, synced: !!parsed.synced };
}



function extractFrontMatter(md) {
  if (!md) return null;
  const m = md.match(/^(\-\-\-|\+\+\+)\s*([\s\S]*?)\s*\1\s*/);
  if (!m) return null;
  const format = m[1] === '---' ? 'yaml' : 'toml';
  const content = m[2] || '';
  const body = md.slice(m[0].length);
  return { format, content, body };
}



function parseFrontMatterContent(format, content) {
  if (format === 'yaml') return parseYamlFrontMatterContent(content);
  if (format === 'toml') return parseTomlFrontMatterContent(content);
  return { notion: false, url: null, tags: [], synced: false };
}



function parseYamlFrontMatterContent(yaml) {
  const lines = (yaml || '').split(/\r?\n/);
  let url = null;
  let tags = [];
  let notion = false;
  let synced = false;

  const unquote = (s) => s.replace(/^\s*["']?(.+?)["']?\s*$/, '$1');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const mn = line.match(/^\s*notion\s*:\s*(.+)\s*$/i);
    if (mn) {
      notion = /^true$/i.test(mn[1].trim());
      continue;
    }

    const ms = line.match(/^\s*notionsynced\s*:\s*(.+)\s*$/i);
    if (ms) {
      synced = /^true$/i.test(ms[1].trim());
      continue;
    }

    const mu = line.match(/^\s*(url|link|source|youtube)\s*:\s*(.+)\s*$/i);
    if (mu) { url = unquote(mu[2].trim()); continue; }

    const mt = line.match(/^\s*tags\s*:\s*(.*)$/i);
    if (mt) {
      const rest = mt[1].trim();
      if (rest.startsWith('[')) {
        const inside = rest.replace(/^\[/, '').replace(/\]$/, '');
        tags = tags.concat(
          inside.split(',').map(s => unquote(s.trim())).filter(Boolean)
        );
        continue;
      }
      if (rest) {
        tags = tags.concat(
          rest.split(',').map(s => unquote(s.trim())).filter(Boolean)
        );
        continue;
      }
      let j = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (/^\s*[A-Za-z_][\w-]*\s*:/.test(l)) break;
        const mi = l.match(/^\s*-\s*(.+)\s*$/);
        if (mi) { tags.push(unquote(mi[1].trim())); j++; continue; }
        if (/^\s*$/.test(l)) { j++; continue; }
        break;
      }
      i = j - 1;
    }
  }

  return { notion, url, tags, synced };
}



function parseTomlFrontMatterContent(toml) {
  const lines = (toml || '').split(/\r?\n/);
  const data = {};

  const stripComment = (line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return '';
    return line;
  };
  const unquote = (s) => s.replace(/^\s*["']?(.+?)["']?\s*$/, '$1');

  const parseTomlValue = (raw) => {
    if (!raw) return '';
    const v = raw.trim();
    if (/^\[(.*)\]$/.test(v)) {
      const inside = v.slice(1, -1).trim();
      if (!inside) return [];
      return inside.split(',').map(part => parseTomlValue(part));
    }
    if (/^"(.*)"$/.test(v)) return RegExp.$1;
    if (/^'(.*)'$/.test(v)) return RegExp.$1;
    if (/^(true|false)$/i.test(v)) return /^true$/i.test(v);
    return v;
  };

  for (const rawLine of lines) {
    const line = stripComment(rawLine);
    if (!line) continue;
    const m = line.match(/^([A-Za-z0-9_\-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    data[key] = parseTomlValue(m[2]);
  }

  const notionRaw = data.notion;
  const notion = typeof notionRaw === 'boolean'
    ? notionRaw
    : /^true$/i.test((notionRaw || '').toString().trim());
  const syncedRaw = data.notionsynced || data.synced;
  const synced = typeof syncedRaw === 'boolean'
    ? syncedRaw
    : /^true$/i.test((syncedRaw || '').toString().trim());
  const url = data.url || data.link || data.source || data.youtube || null;

  let tags = [];
  const rawTags = data.tags;
  if (Array.isArray(rawTags)) {
    tags = rawTags.map(v => unquote(String(v)));
  } else if (typeof rawTags === 'string') {
    tags = rawTags.split(',').map(s => unquote(s));
  }

  return { notion, url, tags, synced };
}
