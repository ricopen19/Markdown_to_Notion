function doGet(e) {
  const code = (e && e.parameter && e.parameter.code) ? String(e.parameter.code) : 'graph TD; A-->B;';
  const safe = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: true, securityLevel: "loose" });</script>
<style>html,body{margin:0;padding:16px;font-family:sans-serif}</style>
</head><body><div class="mermaid">${safe}</div></body></html>`;
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
