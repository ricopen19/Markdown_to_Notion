/**
 * Notion同期設定シート（既存）の指定された列に、
 * 特定の親フォルダ以下すべてのフォルダの名前とIDを再帰的に書き込みます。
 */
function runListSpecificFoldersToSheet() {
  // ▼▼▼ ここを実際の値に書き換えてください ▼▼▼

  // 1. 【必須】対象の親フォルダID（再帰探索を開始する親フォルダのID）
  const PARENT_FOLDER_ID = requireProp('SYNC_FOLDER_ID'); 

  // 2. 【必須】書き込み先のシートID（ご提示いただいたURLの「d/」と「/edit」の間）
  const TARGET_SHEET_ID = requireProp('SYNC_SHEET_ID');

  // 3. 【必須】書き込み先のシート名（通常 'NotionSyncConfig' または 'シート1' など）
  const TARGET_SHEET_NAME = requireProp('SYNC_SHEET_NAME', 'NotionSyncConfig');

  // 4. 【任意】書き込みを開始する行番号（ヘッダーの次の行から: 2行目）
  const START_ROW = 2;

  // 5. 【必須】フォルダ名を書き込む列番号 (C列 = 3)
  const NAME_COL = 3; 

  // 6. 【必須】フォルダIDを書き込む列番号 (D列 = 4)
  const ID_COL = 4;
  
  // ▲▲▲ ここを実際の値に書き換えてください ▲▲▲
  

  // メイン関数を呼び出し
  listSpecificFoldersToSheet(
    PARENT_FOLDER_ID, 
    TARGET_SHEET_ID, 
    TARGET_SHEET_NAME, 
    START_ROW,
    NAME_COL,
    ID_COL
  );
}

// ------------------------------------------------------------------
// グローバル変数（再帰処理で共有されるデータ）
// ------------------------------------------------------------------

/** @type {Array<Array<string>>} フォルダ情報 [ [Name, ID], [Name, ID], ... ] を格納する配列 */
let ALL_FOLDER_DATA = [];


/**
 * (メインロジック) 指定した親フォルダ以下を再帰的に探索し、既存のシートに書き出します。
 * @param {string} parentFolderId 探索を開始する親フォルダのID
 * @param {string} sheetId 書き込み先のスプレッドシートID
 * @param {string} targetSheetName 書き込み先のシート名
 * @param {number} startRow 書き込みを開始する行番号 (1から始まる)
 * @param {number} nameCol フォルダ名を書き込む列番号 (1から始まる)
 * @param {number} idCol フォルダIDを書き込む列番号 (1から始まる)
 */
function listSpecificFoldersToSheet(parentFolderId, sheetId, targetSheetName, startRow, nameCol, idCol) {
  try {
    if (parentFolderId === 'YOUR_PARENT_FOLDER_ID_HERE') {
      Logger.log('エラー: PARENT_FOLDER_ID を指定してください。');
      return;
    }
    
    // 探索開始前にデータ配列を初期化
    ALL_FOLDER_DATA = [];

    // 1. 既存のスプレッドシートとシートを取得
    const spreadsheet = SpreadsheetApp.openById(sheetId);
    const sheet = spreadsheet.getSheetByName(targetSheetName);

    if (!sheet) {
      Logger.log(`エラー: シート名「${targetSheetName}」が見つかりません。`);
      return;
    }
    
    Logger.log(`出力先シートを開きました: ${spreadsheet.getUrl()} - ${targetSheetName}`);
    Logger.log(`親フォルダ (ID: ${parentFolderId}) 以下を再帰的に探索します...`);

    // 2. IDから特定の親フォルダを取得し、探索開始
    const parentFolder = DriveApp.getFolderById(parentFolderId);
    
    // 親フォルダ自体をリストに含める
    ALL_FOLDER_DATA.push([parentFolder.getName(), parentFolder.getId()]);

    // 再帰関数を呼び出し（親フォルダの直下からインデントを開始するため、prefixは空で開始）
    traverseFolder(parentFolder, ''); 

    // 3. 既存データをクリアする
    // 書き込み開始行から最終行まで、フォルダ名とIDの列のみクリアします。
    // getLastRow()がstartRowより小さくなる場合があるので、max()で範囲を保証
    const lastRowToClear = Math.max(sheet.getLastRow(), startRow);
    const clearRange = sheet.getRange(startRow, nameCol, lastRowToClear - startRow + 1, 2);
    clearRange.clearContent();
    Logger.log(`既存のC列/D列のデータ ( ${startRow}行目以降 ) をクリアしました。`);


    // 4. シートの指定範囲に一括で書き込み
    const rowCount = ALL_FOLDER_DATA.length;
    
    if (rowCount > 0) {
      // 書き込み範囲を計算 (開始行, フォルダ名列, データ行数, 2列分)
      const range = sheet.getRange(startRow, nameCol, rowCount, 2);
      
      // 書き込みを実行
      range.setValues(ALL_FOLDER_DATA);
      
      Logger.log(`成功: ${rowCount}件のフォルダ情報をシートに書き込みました。`);
    } else {
      Logger.log('フォルダが見つかりませんでした。');
    }
    
    // 5. 列幅を調整
    sheet.autoResizeColumns(nameCol, 2);

    Logger.log('...処理が完了しました。');

  } catch (e) {
    Logger.log(`エラーが発生しました: ${e.message}`);
    console.error(`エラーが発生しました: ${e.message}`);
  }
}

/**
 * (再帰関数) 指定されたフォルダ以下の全フォルダを探索し、
 * ALL_FOLDER_DATA にデータを格納します。
 * @param {GoogleAppsScript.Drive.Folder} parentFolder 対象フォルダ
 * @param {string} prefix 現在の階層を表すインデント文字列
 */
function traverseFolder(parentFolder, prefix) {
  
  // ゴミ箱にあるフォルダはスキップ
  if (parentFolder.isTrashed()) {
    return;
  }

  // 1. 直下のフォルダを取得
  const subFolders = parentFolder.getFolders();
  const children = [];

  // 2. 子フォルダを配列に収集 (sortするために配列化)
  while (subFolders.hasNext()) {
    const childFolder = subFolders.next();
    
    // 【重要】フォルダ名が ".git" の場合はスキップする
    if (childFolder.getName() === '.git') {
      Logger.log(`フォルダ「.git」をスキップしました。`);
      continue;
    }
    
    children.push(childFolder);
  }
  
  // 3. フォルダ名をソート
  children.sort((a, b) => a.getName().localeCompare(b.getName()));

  // 4. 子フォルダに対して処理と再帰呼び出しを適用
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    
    // 最後の要素かどうか
    const isLast = (i === children.length - 1);
    
    // 表示用のプレフィックス (├─ または └─ を使用)
    const displayPrefix = prefix + (isLast ? '└─ ' : '├─ ');
    
    // 次の再帰呼び出しに渡すプレフィックス (インデントのスペースと│を使用)
    // ├─ の場合は次の行で「│   」、└─ の場合は次の行で「    」と続く
    const nextPrefix = prefix + (isLast ? '    ' : '│   ');

    // データを格納 (表示用プレフィックスを付けて格納)
    ALL_FOLDER_DATA.push([displayPrefix + child.getName(), child.getId()]);
    
    // 再帰呼び出し
    traverseFolder(child, nextPrefix);
  }
}