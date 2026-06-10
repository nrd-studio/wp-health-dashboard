# WP Health Dashboard — 開発履歴

## このアプリについて

WordPress サイトの健全性をリモートから一元管理するダッシュボードツール。

### 構成

| ファイル | 役割 |
|---|---|
| `index.html` | フロントエンド。React 18 (UMD) + バニラJS。ビルド不要の単一HTMLファイル |
| `api/proxy.js` | Vercel サーバーレス関数。CORS回避のためフロントエンドとWordPress間を中継 |
| `wp-health-agent.php` | WordPress プラグイン。REST API エンドポイントを提供 |
| `files/wp-health-dashboard.jsx` | React コンポーネントの開発用ソース（参照用） |

### データフロー

```
ブラウザ (index.html)
  → /api/proxy?siteUrl=...&path=...  [X-WPH-Key: {key} ヘッダ]
    → Vercel (api/proxy.js)
      → {siteUrl}/wp-json/wp-health/v1{path}  [X-WPH-Key: {key} ヘッダ転送]
        → WordPress (wp-health-agent.php)
```

### 機能

- WordPress本体・プラグインのバージョン確認・更新状況チェック
- PHP バージョン判定（ok / eol / critical）
- WordPress 本体・プラグインのワンクリック更新
- 全一括更新
- テーマ PHP ファイル取得（AI リスク分析用）
- コア自動更新ポリシーの取得・制御（`/auto-update` エンドポイント）
- 前回スキャン時との WordPress バージョン差分検知（意図しない自動更新の発見）

### 認証

WordPress プラグイン側で APIキー（`wph_` プレフィックスの40文字ランダム文字列）を生成。
リクエストごとに `X-WPH-Key` ヘッダで検証（`hash_equals` による timing-safe 比較）。

---

## API契約（変更注意）

- ダッシュボード → proxy: APIキーは `X-WPH-Key` ヘッダで送信（クエリ禁止・ログ対策）
- proxy → WordPress: `X-WPH-Key` ヘッダで転送
- `proxy.js` を触るときはこの契約を維持すること

---

## 更新履歴

### 2026-06-10

#### ファイル整理
- `api:proxy.js`（コロン区切りの誤ったファイル名）を `api/proxy.js` に移動。Vercel のサーバーレス関数として正しく機能するよう修正
- `files/wp-health-agent.php`（v1.1.0 の古いバックアップ）を削除
- `wp-health-agent-autoupdate.php`（自動更新ポリシー機能の追加分、`wp-health-agent.php` に統合済み）を削除

#### wp-health-agent.php: v1.3.0 へ更新
- 自動更新ポリシー検知・制御エンドポイント追加（`/auto-update`, `/auto-update/major`）
- `WPHA_VERSION` 定数を `1.2.0` → `1.3.0` に修正（Plugin header との不一致を解消）
- **セキュリティ修正**: CORS設定を変更
  - 任意の `Origin` を反射 + `Allow-Credentials: true` という危険な組み合わせを廃止
  - `X-WPH-Key` ヘッダ認証のためクッキーは不要なので `Access-Control-Allow-Origin: *`（credentials なし）に統一

#### api/proxy.js: SSRF 対策を追加
- `siteUrl` を `new URL()` でパース後、以下を検証：
  - `https:` スキームのみ許可
  - userinfo（`user:pass@`）禁止
  - プライベート/ループバック/リンクローカル IP ブロック（127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x, ::1, fc/fd）
  - origin のみ使用し path/query を除去
- `path` パラメータを `/[A-Za-z0-9/_-]*` の正規表現で検証
- `redirect: 'manual'` を追加（30x リダイレクトによる内部 IP へのバウンス防止）

#### GitHub リポジトリ初期化
- `https://github.com/nrd-studio/wp-health-dashboard` に初回プッシュ
- `.gitignore` 設定: `.DS_Store`, `*.zip`, `tasks/`, `/proxy.js`（ルートの旧 CommonJS 版）を除外
