function syncMarkedFilesToNotion() {
  syncFolderEntries(VAULT_FOLDER_ID, { databaseId: DATABASE_ID });
}



function syncMarkedFilesFromSheet() {
  if (!SYNC_CONFIG_SHEET_ID) {
    Logger.log('⚠️ SYNC_CONFIG_SHEET_ID が設定されていません。');
    return;
  }
  const config = loadSyncConfigRows();
  if (!config || !config.rows.length) {
    Logger.log('⚠️ NotionSyncConfig シートに同期対象がありません。');
    return;
  }
  for (const row of config.rows) {
    const data = row.values;
    if (isConfigRowBlank(data)) {
      continue;
    }
    const isActive = parseSheetBoolean(data.Active);
    if (!isActive) {
      updateConfigRowStatus(config, row.rowIndex, { Status: 'Skipped (inactive)' });
      continue;
    }
    const mode = String(data.Mode || 'folder').toLowerCase();
    const databaseId = (data.NotionDatabaseId && data.NotionDatabaseId.toString().trim()) || null;
    const folderId = data.FolderId && data.FolderId.toString().trim();
    let summary = { total: 0, synced: 0 };
    let status = '';
    try {
      if (mode !== 'folder') {
        status = `Unsupported mode: ${mode}`;
      } else {
        if (!folderId) throw new Error('FolderId が未設定です');
        summary = syncFolderEntries(folderId, {
          databaseId: databaseId || DATABASE_ID,
          label: data.FolderName || folderId
        });
        status = `OK folder (synced ${summary.synced})`;
      }
      updateConfigRowStatus(config, row.rowIndex, {
        LastSynced: new Date(),
        Status: status
      });
    } catch (e) {
      Logger.log(`❌ Config row ${row.rowIndex} failed: ${e}`);
      updateConfigRowStatus(config, row.rowIndex, { Status: `Error: ${e.message}` });
    }
  }
}

function syncFolderEntries(folderId, options) {
  options = options || {};
  const folder = DriveApp.getFolderById(folderId);
  const entries = [];
  collectMarkdownEntries(folder, '', entries);

  const label = options.label || folder.getName() || folderId;
  Logger.log(`📁 Folder "${label}": found ${entries.length} markdown files`);

  let syncedCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const raw = entry.file.getBlob().getDataAsString('UTF-8');
    const meta0 = parseFrontMatter(raw) || { body: raw, url: null, tags: [], notion: false, synced: false, format: null };

    const hasExportMarker = /^#export:notion\b/m.test(raw);
    const hasNotionTag = Array.isArray(meta0.tags)
      ? meta0.tags.some(tag => tag && tag.toLowerCase() === 'notiondb')
      : false;
    if (meta0.synced) {
      Logger.log(`⏭️ Skip (NotionSynced=true): ${entry.path}`);
      continue;
    }

    const shouldSync = meta0.notion || hasExportMarker || hasNotionTag;
    if (!shouldSync) {
      Logger.log(`⏭️ Skip (no notion marker): ${entry.path}`);
      continue;
    }

    const title = entry.name.replace(/\.md$/i, '');
    const mdBody = meta0.body || raw;
    const blocks = mdToNotionBlocks(mdBody);

    const url = meta0.url || ((mdBody.match(ANY_URL_REGEX) || [])[0] || null);
    const meta = { url, tags: Array.isArray(meta0.tags) ? meta0.tags : [] };

    Logger.log(`⬆️ Syncing: ${entry.path}`);
    upsertByTitle(title, blocks, meta, options);
    syncedCount++;
    ensureFileFrontMatterSynced(entry.file, raw);
  }

  Logger.log(`✅ Folder "${label}" sync done. markdown=${entries.length}, synced=${syncedCount}`);
  return { total: entries.length, synced: syncedCount };
}



function collectMarkdownEntries(folder, prefix, out) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    const name = file.getName();
    if (/\.md$/i.test(name)) {
      out.push({ file, name, path: prefix + name });
    } else {
      Logger.log(`⏭️ Skip (not md): ${prefix + name}`);
    }
  }

  const subFolders = folder.getFolders();
  while (subFolders.hasNext()) {
    const sub = subFolders.next();
    const subName = sub.getName();
    Logger.log(`📂 Enter: ${prefix + subName}/`);
    collectMarkdownEntries(sub, `${prefix}${subName}/`, out);
  }
}



function loadSyncConfigRows() {
  const ss = SpreadsheetApp.openById(SYNC_CONFIG_SHEET_ID);
  const sheet = ss.getSheetByName(SYNC_CONFIG_SHEET_NAME);
  if (!sheet) throw new Error(`シート ${SYNC_CONFIG_SHEET_NAME} が見つかりません`);
  const range = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn());
  const values = range.getValues();
  if (!values.length) return { sheet, headerMap: {}, rows: [] };
  const headers = values.shift();
  const headerMap = {};
  headers.forEach((h, idx) => { headerMap[h] = idx + 1; });
  const rows = values.map((row, idx) => {
    const obj = {};
    headers.forEach((h, colIdx) => { obj[h] = row[colIdx]; });
    return { rowIndex: idx + 2, values: obj };
  });
  return { sheet, headerMap, rows };
}



function updateConfigRowStatus(config, rowIndex, fields) {
  if (!config || !config.sheet) return;
  Object.keys(fields).forEach((key) => {
    const col = config.headerMap[key];
    if (!col) return;
    config.sheet.getRange(rowIndex, col).setValue(fields[key]);
  });
}



function parseSheetBoolean(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (!lower) return false;
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  return false;
}



function isConfigRowBlank(data) {
  if (!data) return true;
  for (const key of Object.keys(data)) {
    const v = data[key];
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    if (typeof v === 'boolean') {
      if (v === true) return false;
      continue;
    }
    if (typeof v === 'number' && v === 0) continue;
    return false;
  }
  return true;
}



function ensureFileFrontMatterSynced(file, originalRaw) {
  const result = ensureNotionSyncedFrontMatterText(originalRaw);
  if (result && result.updated) {
    file.setContent(result.content);
    Logger.log(`📝 Updated NotionSynced front matter: ${file.getName()}`);
  }
}
