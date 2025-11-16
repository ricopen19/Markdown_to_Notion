/**
 * Drive フォルダ構成をスプレッドシートに書き出す補助スクリプトです。
 * `PARENT_FOLDER_ID` 直下を走査し、フォルダ名/ID を `NotionSyncConfig` シートに
 * 転記する想定です。
 */
const PARENT_FOLDER_ID = 'YOUR_PARENT_FOLDER_ID';
const TARGET_SHEET_ID = 'YOUR_SPREADSHEET_ID';
const TARGET_SHEET_NAME = 'NotionSyncConfig';

function runListSpecificFoldersToSheet() {
  if (!PARENT_FOLDER_ID || PARENT_FOLDER_ID === 'YOUR_PARENT_FOLDER_ID') {
    Logger.log('PARENT_FOLDER_ID を設定してください');
    return;
  }

  const ss = SpreadsheetApp.openById(TARGET_SHEET_ID);
  const sheet = ss.getSheetByName(TARGET_SHEET_NAME);
  if (!sheet) {
    Logger.log('対象シートが見つかりません');
    return;
  }

  const parent = DriveApp.getFolderById(PARENT_FOLDER_ID);
  const rows = [];
  listFoldersRecursive(parent, rows, '');

  if (!rows.length) {
    Logger.log('フォルダは見つかりませんでした');
    return;
  }

  const startRow = 2;
  const nameCol = 3; // FolderName 列
  const idCol = 4;   // FolderId 列
  const range = sheet.getRange(startRow, nameCol, rows.length, 2);
  range.clearContent();
  range.setValues(rows);
  Logger.log(`フォルダ情報を ${rows.length} 件書き込みました`);
}

function listFoldersRecursive(folder, rows, prefix) {
  const children = [];
  const iterator = folder.getFolders();
  while (iterator.hasNext()) {
    children.push(iterator.next());
  }
  children.sort((a, b) => a.getName().localeCompare(b.getName()));
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const displayName = prefix ? `${prefix} └─ ${child.getName()}` : child.getName();
    rows.push([displayName, child.getId()]);
    listFoldersRecursive(child, rows, displayName);
  }
}
