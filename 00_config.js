/***** Config *****/
const SCRIPT_PROPS = PropertiesService.getScriptProperties();

function requireProp(key, fallback) {
  const value = SCRIPT_PROPS.getProperty(key);
  if (value && value.trim()) return value.trim();
  if (fallback !== undefined) return fallback;
  throw new Error(`Script property "${key}" が設定されていません`);
}

const NOTION_TOKEN        = requireProp('NOTION_TOKEN');
const DATABASE_ID         = requireProp('DATABASE_ID');
const MERMAID_WEBAPP_BASE = requireProp('MERMAID_WEBAPP_BASE');
const VAULT_FOLDER_ID     = requireProp('VAULT_FOLDER_ID');
const SYNC_CONFIG_SHEET_ID   = requireProp('SYNC_SHEET_ID');
const SYNC_CONFIG_SHEET_NAME = requireProp('SYNC_SHEET_NAME', 'NotionSyncConfig');

const NOTION_VERSION_DEFAULT = '2022-06-28';
const NOTION_VERSION_TABLE   = '2025-09-03'; // table/table_row対応の最新バージョン

const buildNotionHeaders = (version) => ({
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': version
});

const NOTION_HEADERS = buildNotionHeaders(NOTION_VERSION_DEFAULT);
const NOTION_TABLE_HEADERS = buildNotionHeaders(NOTION_VERSION_TABLE);


// Regex
const YT_REGEX = /https?:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]+[^\s]*|youtube\.com\/embed\/[\w-]+[^\s]*)/i;
const FENCE_END = /^```\s*$/;

// $$ と \$ を誤爆しないインラインLaTeX
const INLINE_TEX_REGEX = /(?<!\\)(?<!\$)\$(?!\$)\s*([\s\S]+?)(?<!\\)\s*\$(?!\$)/g;


// 追加：\$ 退避用プレースホルダ
const ESCAPED_DOLLAR_PLACEHOLDER = '__GAS_DOLLAR__';

// Inline markdown
const MD_LINK_REGEX   = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const MD_BOLD_REGEX   = /\*\*([^*]+)\*\*/g;
const MD_ITALIC_REGEX = /_(.+?)_/g;

// 汎用URL検出（最初の1件）
const ANY_URL_REGEX = /https?:\/\/[^\s)\]]+/i;

// Table 検出 & 分割（\| はエスケープとして扱い、後で '|' に戻す）
const TABLE_ROW_REGEX   = /^\s*\|.*\|\s*$/;
const TABLE_ALIGN_REGEX = /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/; // |---|:---:|---:| など
const SPLIT_PIPE_REGEX  = /(?<!\\)\|/g;                     // バックスラッシュでない '|' で分割
