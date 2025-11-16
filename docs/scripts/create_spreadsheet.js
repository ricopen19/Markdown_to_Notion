/**
 * Notion同期用の設定スプレッドシートを自動生成する補助スクリプトです。
 * Apps Script プロジェクトで実行すると、`NotionSyncConfig` という名称の
 * スプレッドシートが My Drive に作成されます。
 */
function createSyncConfigSheet() {
  const sheetName = 'NotionSyncConfig';
  const headers = [
    'Active',
    'Mode',
    'FolderName',
    'FolderId',
    'FileId',
    'Tags',
    'URL',
    'NotionDatabaseId',
    'FrontMatterOnly',
    'Schedule',
    'LastSynced',
    'Status',
  ];

  const ss = SpreadsheetApp.create(`GAS同期設定 ${sheetName}`);
  const sheet = ss.getActiveSheet();
  sheet.setName(sheetName);

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1)
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .setAllowInvalid(false)
      .build());

  const modeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['folder', 'file'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setDataValidation(modeRule);

  sheet.autoResizeColumns(1, headers.length);
  Logger.log(`スプレッドシートを作成しました: ${ss.getUrl()}`);
}
