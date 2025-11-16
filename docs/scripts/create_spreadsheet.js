/**
 * Notion同期（あるいは他のサービスとの連携）のための
 * 設定用スプレッドシートを新しく作成します。
 *
 * この関数（createSyncConfigSheet）を実行すると、
 * マイドライブのルートに新しいスプレッドシートが作成され、
 * 実行ログにそのURLが出力されます。
 */
function createSyncConfigSheet() {
    try {
      const sheetName = 'NotionSyncConfig';
      
      // ユーザー定義のヘッダーリスト
      // 運用しやすいように順序を調整し、ステータス列も追加しています。
      const headers = [
        // --- 設定項目 (ユーザーが入力) ---
        'Active',         // 同期対象 (TRUE/FALSE)
        'Mode',           // 同期モード (folder/file)
        'FolderId',       // Drive フォルダID (Mode=folder の場合)
        'FileId',         // Drive ファイルID (Mode=file の場合)
        'Tags',           // メタ情報: タグ (カンマ区切りなど)
        'URL',            // メタ情報: 関連URL
        'NotionDatabaseId', // (オプション) 同期先DB ID
        'FrontMatterOnly',  // (オプション) フロントマターのみ (TRUE/FALSE)
        'Schedule',       // (オプション) 同期頻度メモ
        
        // --- GASが書き込む欄 ---
        'LastSynced',     // (GASが書き込む) 最終同期日時
        'Status'          // (GASが書き込む) 最終同期ステータス (DONE/FAILED/...)
      ];
  
      // 新しいスプレッドシートを作成
      const spreadsheet = SpreadsheetApp.create(`【GAS同期設定】${sheetName}`);
      const sheet = spreadsheet.getActiveSheet();
      
      // シート名を変更
      sheet.setName(sheetName);
  
      // 1. ヘッダーを1行目に書き込む
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  
      // 2. ヘッダー行のスタイル設定
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setFontWeight('bold'); // 太字
      headerRange.setBackground('#eeeeee'); // 背景色
      headerRange.setVerticalAlignment('middle'); // 上下中央揃え
      
      // 3. 1行目を固定
      sheet.setFrozenRows(1);
  
      // 4. データ検証の設定 (入力支援)
      // Active列 (A列) にチェックボックスを設定
      const activeRule = SpreadsheetApp.newDataValidation()
        .requireCheckbox()
        .setAllowInvalid(false)
        .build();
      // 2行目以降に適用
      sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1).setDataValidation(activeRule);
  
      // Mode列 (B列) にドロップダウンリスト (folder/file) を設定
      const modeRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['folder', 'file'], true) // ドロップダウンリストを有効化
        .setAllowInvalid(false) // リスト以外の値を許可しない
        .build();
      // 2行目以降に適用
      sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1).setDataValidation(modeRule);
  
      // 5. 列幅をコンテンツに合わせて自動調整
      sheet.autoResizeColumns(1, headers.length);
      
      // 6. GASが書き込む列（LastSynced, Status）を少し目立たせる（任意）
      const gasWriteCols = sheet.getRange(1, headers.indexOf('LastSynced') + 1, sheet.getMaxRows(), 2);
      gasWriteCols.setBackground('#f9f9f9');
  
  
      // 実行ログに作成したシートのURLを出力
      const url = spreadsheet.getUrl();
      Logger.log(`設定シートを作成しました: ${url}`);
      console.log(`設定シートを作成しました: ${url}`);
      
      //（参考）実行者にメールで通知する場合
      // const email = Session.getActiveUser().getEmail();
      // if (email) {
      //   MailApp.sendEmail(email, 
      //     '【GAS】同期設定用スプレッドシートが作成されました', 
      //     `以下のURLからシートを確認し、設定を入力してください。\n\n${url}`
      //   );
      // }
  
    } catch (e) {
      Logger.log(`エラーが発生しました: ${e.message}`);
      console.error(`エラーが発生しました: ${e.message}`);
    }
  }