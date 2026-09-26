# chrome-extension-futaba

ふたばちゃんねる(2chan.net)PC版Chrome向け支援拡張機能。

ページ右側の空き領域にiframeで情報表示パネルを差し込む方式で実装している。

## 開発

1. `chrome://extensions` を開き「デベロッパーモード」を有効化
2. 「パッケージ化されていない拡張機能を読み込む」でこのディレクトリを選択

## 構成

- `manifest.json` — Manifest V3 定義
- `content.js` / `content.css` — 対象ページに情報表示パネル用iframeを差し込むcontent script
- `panel/` — パネル(iframe)側のHTML/CSS/JS
