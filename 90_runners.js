function pushOneFileToNotion() {
  const FILE_ID = '1MBlBwtj9sr35S_6Caz0n4I3fOufU2hF4';
  const file = DriveApp.getFileById(FILE_ID);
  const title = file.getName().replace(/\.md$/i, '');
  const raw  = file.getBlob().getDataAsString('UTF-8');

  const meta0 = parseFrontMatter(raw) || { body: raw, url: null, tags: [], notion: false, synced: false };
  if (meta0.synced) {
    Logger.log('⏭️ Skip (NotionSynced=true) for pushOneFileToNotion');
    return;
  }
  const mdBody = meta0.body || raw;               // ★ 本文は必ず body
  const blocks = mdToNotionBlocks(mdBody);

  // URL フォールバック（必要なときだけ）
  const url = meta0.url || ((mdBody.match(ANY_URL_REGEX) || [])[0] || null);
  const meta = { url, tags: Array.isArray(meta0.tags) ? meta0.tags : [] };

  createPageWithChunkAppend(title, blocks, meta);
}

function syncMarkedFilesToNotion() {
  const folder = DriveApp.getFolderById(VAULT_FOLDER_ID);
  const entries = [];
  collectMarkdownEntries(folder, '', entries);

  Logger.log(`📁 Found ${entries.length} markdown files under vault.`);
  let syncedCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const raw = entry.file.getBlob().getDataAsString('UTF-8');
    const meta0 = parseFrontMatter(raw) || { body: raw, url: null, tags: [], notion: false, synced: false };

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
    const mdBody = meta0.body || raw;             // ★ 本文は必ず body
    const blocks = mdToNotionBlocks(mdBody);

    const url = meta0.url || ((mdBody.match(ANY_URL_REGEX) || [])[0] || null);
    const meta = { url, tags: Array.isArray(meta0.tags) ? meta0.tags : [] };

    Logger.log(`⬆️ Syncing: ${entry.path}`);
    upsertByTitle(title, blocks, meta);
    syncedCount++;
  }

  Logger.log(`✅ syncMarkedFilesToNotion done. markdown=${entries.length}, synced=${syncedCount}`);
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
