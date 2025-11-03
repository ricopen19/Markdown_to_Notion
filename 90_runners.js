function pushOneFileToNotion() {
  const FILE_ID = '1MBlBwtj9sr35S_6Caz0n4I3fOufU2hF4';
  const file = DriveApp.getFileById(FILE_ID);
  const title = file.getName().replace(/\.md$/i, '');
  const raw  = file.getBlob().getDataAsString('UTF-8');

  const meta0 = parseFrontMatter(raw) || { body: raw, url: null, tags: [] };
  const mdBody = meta0.body || raw;               // ★ 本文は必ず body
  const blocks = mdToNotionBlocks(mdBody);

  // URL フォールバック（必要なときだけ）
  const url = meta0.url || ((mdBody.match(ANY_URL_REGEX) || [])[0] || null);
  const meta = { url, tags: Array.isArray(meta0.tags) ? meta0.tags : [] };

  createPageWithChunkAppend(title, blocks, meta);
}

function syncMarkedFilesToNotion() {
  const folder = DriveApp.getFolderById(VAULT_FOLDER_ID);
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    if (!/\.md$/i.test(f.getName())) continue;

    const raw = f.getBlob().getDataAsString('UTF-8');
    if (!(hasFrontMatterNotionTrue(raw) || /^#export:notion\b/m.test(raw))) continue;

    const title = f.getName().replace(/\.md$/i, '');
    const meta0 = parseFrontMatter(raw) || { body: raw, url: null, tags: [] };
    const mdBody = meta0.body || raw;             // ★ 本文は必ず body
    const blocks = mdToNotionBlocks(mdBody);

    const url = meta0.url || ((mdBody.match(ANY_URL_REGEX) || [])[0] || null);
    const meta = { url, tags: Array.isArray(meta0.tags) ? meta0.tags : [] };

    upsertByTitle(title, blocks, meta);
  }
}
