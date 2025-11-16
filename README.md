# gasNotion

Notion と Google Drive (Obsidian Vault 等) を同期するための Google Apps Script プロジェクトです。  
Markdown → Notion ブロックへの変換や、Notion テーブル・Mermaid・LaTeX といった拡張にも対応しています。

この README ではセットアップ方法と、同期対象を管理するためのハブスプレッドシートについて説明します。

---

## セットアップ

1. リポジトリを `clasp clone` または `git clone` で取得
2. `00_config_init.js` を `00_config.js` にリネーム
3. `00_config.js` に以下の値をセット  
   - `NOTION_TOKEN`, `DATABASE_ID`  
   - `MERMAID_WEBAPP_BASE`, `VAULT_FOLDER_ID`  
   - `SYNC_CONFIG_SHEET_ID`, `SYNC_CONFIG_SHEET_NAME`  
4. GAS に `clasp push` (または Apps Script editor で貼り付け)  
5. Notion 側で連携アプリに必要な DB へのアクセス権を付与

※ `00_config.js` は `.gitignore` 済みなので、公開リポジトリには含まれません。

---

## ハブスプレッドシート

同期対象はスプレッドシート `NotionSyncConfig` で管理します。  
列構成（推奨）は以下の通りです。

| 列 | 説明 |
| --- | --- |
| `Active` | TRUE/FALSE (チェックボックス) |
| `Mode` | `folder` / `file` |
| `FolderName` | 任意のメモ（表示用） |
| `FolderId` | `Mode=folder` のときに同期する Drive フォルダ ID |
| `FileId` | `Mode=file` のときに同期する Drive ファイル ID |
| `Tags`, `URL` | Notion へ送るメタ情報（任意） |
| `NotionDatabaseId` | 空ならデフォルト DB、値があれば行ごとに別 DB を使用 |
| `FrontMatterOnly` | true の場合はフロントマター内の本文のみ同期 (今後拡張予定) |
| `Schedule` | 任意のメモ欄 |
| `LastSynced`, `Status` | GAS が書き込む同期履歴 |

### シートを自動生成する GAS

`createSyncConfigSheet()` を実行すると、上記構成のスプレッドシートを自動作成できます。  
（コード例は `docs/scripts/create_spreadsheet.js` にあります）


### フォルダ一覧をシートに転記する GAS

`runListSpecificFoldersToSheet()` を使うと、指定フォルダ配下のツリー構造をシートへ書き出し、`FolderName` / `FolderId` 列を一括転記できます。  
（コード例は `docs/scripts/id_fetch.js` にあります）

![listFoldersToSheet](./docs/images/spreadsheet_sample.png)

---

## 同期の流れ

1. シートの `Active` を ON にし、`Mode` / `FolderId` / `FileId` を設定する
2. `syncMarkedFilesFromSheet()` を実行すると、行ごとに同期処理が走る  
   - `Mode=folder`: Vault 配下の Markdown を走査し、NotionSynced/NotionDB タグなどの条件で同期  
   - `Mode=file`: 単発でファイルを同期
3. 同期結果・時刻が `Status` / `LastSynced` に書き戻される

---

## 既知の機能

- Markdown → Notion ブロック変換（見出し、リスト、LaTeX、Mermaid、引用 etc.）
- テーブル：環境が許せば table/table_row を API から投稿、非対応環境では Markdown コードにフォールバック
- NotionSynced フラグの自動付与（front matter に `NotionSynced: true` を追記）
- ハブスプレッドシートから複数フォルダをまとめて同期

---

## ライセンス

ご自由にお使いください。