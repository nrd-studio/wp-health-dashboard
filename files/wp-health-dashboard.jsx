import { useState } from "react";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ─── Demo Data ────────────────────────────────────────── */
const DEMO = {
  site: { name: "株式会社サンプル", url: "https://example.com" },
  wordpress: { current: "6.4.2", latest: "6.7.2", updateAvailable: true },
  php: { current: "7.4.33", recommended: "8.2", status: "eol" },
  plugins: [
    { slug: "contact-form-7",        name: "Contact Form 7",        current: "5.8.3",  latest: "5.9.8",  updateAvailable: true,  active: true },
    { slug: "advanced-custom-fields", name: "Advanced Custom Fields", current: "6.1.8",  latest: "6.3.11", updateAvailable: true,  active: true },
    { slug: "wordfence",             name: "Wordfence Security",     current: "7.10.6", latest: "7.10.6", updateAvailable: false, active: true },
    { slug: "wp-fastest-cache",      name: "WP Fastest Cache",      current: "1.2.1",  latest: "1.2.7",  updateAvailable: true,  active: true },
    { slug: "yoast-seo",             name: "Yoast SEO",             current: "22.0",   latest: "22.0",   updateAvailable: false, active: true },
    { slug: "smush",                 name: "Smush",                 current: "3.16.1", latest: "3.16.1", updateAvailable: false, active: false },
  ]
};

/* ─── Demo Theme File (functions.php のサンプル) ─────── */
const DEMO_FUNCTIONS_PHP = `<?php
/**
 * カスタムテーマ functions.php
 * my-custom-theme v2.1.0
 */

// ═══ Contact Form 7 カスタマイズ ══════════════════════

// メール送信後にCRMへリード登録
add_action('wpcf7_mail_sent', 'theme_cf7_after_sent');
function theme_cf7_after_sent($contact_form) {
    $submission = WPCF7_Submission::get_instance();
    $data = $submission->get_posted_data();
    wp_remote_post('https://crm.example.com/api/leads', [
        'body' => json_encode(['name' => $data['your-name'], 'email' => $data['your-email']])
    ]);
}

// 電話番号バリデーション拡張
add_filter('wpcf7_validate_tel*', 'theme_validate_phone', 20, 2);
function theme_validate_phone($result, $tag) {
    $val = $_POST[$tag->name] ?? '';
    if (!preg_match('/^0\\d{9,10}$/', str_replace('-', '', $val))) {
        $result->invalidate($tag, '正しい電話番号を入力してください（ハイフンなし）');
    }
    return $result;
}

// 送信ボタンのクラスをカスタマイズ
add_filter('wpcf7_form_elements', 'theme_cf7_form_elements');
function theme_cf7_form_elements($html) {
    return str_replace('class="wpcf7-submit"', 'class="wpcf7-submit c-btn c-btn--primary"', $html);
}

// スパムフィルターのカスタムロジック（特定IPをスキップ）
add_filter('wpcf7_spam', 'theme_cf7_spam_filter', 10, 2);
function theme_cf7_spam_filter($spam, $submission) {
    $trusted_ips = ['203.0.113.10', '198.51.100.5'];
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (in_array($ip, $trusted_ips)) return false;
    return $spam;
}

// ═══ Advanced Custom Fields ════════════════════════════

// Gutenbergカスタムブロック登録
add_action('acf/init', 'theme_acf_register_blocks');
function theme_acf_register_blocks() {
    if (!function_exists('acf_register_block_type')) return;
    acf_register_block_type([
        'name'            => 'cta-section',
        'title'           => 'CTAセクション',
        'render_template' => 'template-parts/block-cta.php',
        'category'        => 'formatting',
        'icon'            => 'megaphone',
    ]);
    acf_register_block_type([
        'name'            => 'staff-card',
        'title'           => 'スタッフカード',
        'render_template' => 'template-parts/block-staff.php',
        'category'        => 'formatting',
        'icon'            => 'admin-users',
    ]);
}

// ACFオプションページ追加
if (function_exists('acf_add_options_page')) {
    acf_add_options_page(['page_title' => 'サイト全体設定', 'menu_slug' => 'site-options']);
}

// ACFを使ったカード情報取得（各地で呼び出し）
function theme_get_card_data($post_id) {
    return [
        'lead'    => get_field('card_lead',    $post_id),
        'image'   => get_field('card_image',   $post_id),
        'cta_url' => get_field('card_cta_url', $post_id),
        'color'   => get_field('accent_color', $post_id) ?: '#000',
    ];
}

// フレキシブルコンテンツ展開
function theme_render_flexible($post_id) {
    $sections = get_field('page_sections', $post_id);
    if (!$sections) return;
    foreach ($sections as $section) {
        get_template_part('template-parts/flex', $section['acf_fc_layout']);
    }
}

// ═══ WP Fastest Cache 連携 ════════════════════════════

// 特定投稿タイプ保存時にキャッシュクリア
add_action('save_post_service', 'theme_clear_wpfc');
function theme_clear_wpfc($post_id) {
    if (class_exists('WpFastestCache')) {
        $wpfc = new WpFastestCache();
        $wpfc->deleteCache(true);
    }
}

// ═══ その他ユーティリティ ══════════════════════════════

// PHP 7.x スタイルのコード（PHP 8.x で挙動変化の可能性）
function theme_truncate($str, $len = 80) {
    return mb_strlen($str) > $len ? mb_substr($str, 0, $len) . '…' : $str;
}

// 動的フック登録（デバッグ用・本番では削除推奨）
foreach (['the_title', 'the_content', 'the_excerpt'] as $hook) {
    add_filter($hook, 'trim');
}
`;

const SCAN_STEPS = [
  "サイトへ接続中...",
  "WordPress バージョンを確認中...",
  "PHP バージョンを確認中...",
  "インストール済みプラグインを一覧取得...",
  "WordPress.org API で最新バージョンを照合中...",
  "セキュリティ脆弱性データベースを確認中...",
  "テーマファイルのインデックスを作成中...",
  "レポートを生成中...",
];

/* ─── Risk Analysis Functions ───────────────────────── */
async function analyzeRisk(plugin, themeContent) {
  const prompt = `WordPressカスタムテーマのfunctions.phpを分析し、以下のプラグインアップデートのリスクを評価してください。

【更新対象】
プラグイン: ${plugin.name}
現在バージョン: ${plugin.current} → 更新後: ${plugin.latest}

【テーマ functions.php の内容】
\`\`\`php
${themeContent}
\`\`\`

回答形式（厳守）：
1行目：RISK:高 または RISK:中 または RISK:低 のみ記載
2行目以降：以下の内容を日本語で簡潔に記述
・functions.phpが使用している${plugin.name}のフック・関数・フィルターを列挙
・${plugin.latest}での変更・廃止事項との衝突リスク（具体的な関数名で）
・更新前に確認・修正が必要なコード箇所
・推奨アクション（「すぐ更新可」「テスト環境で確認後」「修正してから更新」のいずれか）

エンジニアがそのまま行動できる実用的な内容にしてください。`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const json = await res.json();
  const text = json.content?.[0]?.text || "分析の取得に失敗しました";
  const riskMatch = text.match(/RISK:(高|中|低)/);
  const riskLevel = riskMatch ? riskMatch[1] : "中";
  const analysis = text.replace(/^RISK:(高|中|低)\n?/, "").trim();
  return { riskLevel, analysis };
}

async function analyzeAllRisks(plugins, wpUpdate, themeContent) {
  const lines = [];
  if (wpUpdate) lines.push(`- WordPress本体: ${wpUpdate.current} → ${wpUpdate.latest}`);
  plugins.forEach(p => lines.push(`- ${p.name}: ${p.current} → ${p.latest}`));

  const prompt = `WordPressカスタムテーマのfunctions.phpを分析し、以下の全アップデートを一括実行する場合のリスクを評価してください。

【更新対象一覧】
${lines.join("\n")}

【テーマ functions.php の内容】
\`\`\`php
${themeContent}
\`\`\`

回答形式（厳守）：
1行目：RISK:高 または RISK:中 または RISK:低 のみ（全体の総合リスク）
2行目以降：
・各更新項目とfunctions.phpの衝突リスクを箇条書き
・最優先で確認すべき点
・推奨する更新の実施順序

日本語で実用的に記述してください。`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const json = await res.json();
  const text = json.content?.[0]?.text || "分析の取得に失敗しました";
  const riskMatch = text.match(/RISK:(高|中|低)/);
  const riskLevel = riskMatch ? riskMatch[1] : "中";
  const analysis = text.replace(/^RISK:(高|中|低)\n?/, "").trim();
  return { riskLevel, analysis };
}

/* ─── CSS ───────────────────────────────────────────── */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Mono:wght@400;500&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#05090d;--surface:#0b1320;--surface2:#101d2e;
  --border:#192940;--border2:#1f3450;
  --accent:#06cfe0;--accent-d:rgba(6,207,224,.10);--accent-g:rgba(6,207,224,.22);
  --green:#1bd97a;--amber:#f5a623;--red:#ff4455;
  --t1:#e0ecf8;--t2:#7ba3c0;--t3:#3d6482;
  --mono:'DM Mono','Courier New',monospace;
  --display:'Syne','Hiragino Kaku Gothic ProN',sans-serif;
}
body{background:var(--bg);color:var(--t1);font-family:var(--display);min-height:100vh;font-size:14px}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:var(--bg)}::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}

.setup{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(6,207,224,.06) 0%,transparent 60%)}
.setup-card{width:100%;max-width:460px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:40px}
.logo-wrap{text-align:center;margin-bottom:32px}
.logo-box{width:52px;height:52px;background:var(--accent-d);border:1px solid var(--accent);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:14px}
.logo-name{font-size:22px;font-weight:800;letter-spacing:-1px}
.logo-sub{font-size:11px;color:var(--t2);margin-top:4px;font-weight:600}
.field{margin-bottom:16px}
.field label{display:block;font-size:10px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:6px}
.field input{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;color:var(--t1);font-family:var(--mono);font-size:13px;outline:none;transition:border-color .15s,box-shadow .15s}
.field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-d)}
.field input::placeholder{color:var(--t3)}
.btn-primary{width:100%;background:var(--accent);color:#000;border:none;border-radius:7px;padding:13px;font-family:var(--display);font-size:14px;font-weight:800;cursor:pointer;margin-top:8px;transition:opacity .15s,transform .1s}
.btn-primary:hover{opacity:.88;transform:translateY(-1px)}
.demo-note{margin-top:18px;padding:13px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:11px;color:var(--t3);line-height:1.7}
.demo-note strong{color:var(--t2)}

.scanning{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:24px}
.scan-heading{font-size:15px;font-weight:700;color:var(--t2)}
.scan-box{width:100%;max-width:460px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:22px;display:flex;flex-direction:column;gap:10px}
.scan-line{font-family:var(--mono);font-size:12px;color:var(--t2);display:flex;align-items:center;gap:10px;animation:fadeSlide .3s ease}
.scan-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0}
@keyframes fadeSlide{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:translateX(0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes modalIn{from{opacity:0;transform:translateY(20px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes overlayIn{from{opacity:0}to{opacity:1}}

.dash{min-height:100vh;display:flex;flex-direction:column}
.hdr{padding:13px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;background:var(--surface);position:sticky;top:0;z-index:10;flex-wrap:wrap}
.hdr-logo{font-size:14px;font-weight:800;letter-spacing:-.5px;color:var(--accent);white-space:nowrap}
.hdr-sep{width:1px;height:18px;background:var(--border);flex-shrink:0}
.hdr-url{font-family:var(--mono);font-size:11px;color:var(--t2);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.hdr-time{font-family:var(--mono);font-size:10px;color:var(--t3);white-space:nowrap}
.btn-sm{background:transparent;border:1px solid var(--border);border-radius:5px;color:var(--t2);padding:5px 11px;font-family:var(--display);font-size:11px;font-weight:700;cursor:pointer;transition:border-color .15s,color .15s;white-space:nowrap}
.btn-sm:hover{border-color:var(--accent);color:var(--accent)}
.btn-accent{background:var(--accent-d);border:1px solid var(--accent);color:var(--accent);border-radius:5px;padding:5px 13px;font-family:var(--display);font-size:11px;font-weight:800;cursor:pointer;transition:background .15s;white-space:nowrap}
.btn-accent:hover{background:var(--accent-g)}
.btn-accent:disabled{opacity:.45;cursor:not-allowed}

.content{padding:20px;flex:1;max-width:1080px;margin:0 auto;width:100%}

.score-bar{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 22px;margin-bottom:18px;display:flex;align-items:center;gap:18px}
.score-num{font-size:32px;font-weight:800;font-family:var(--mono);min-width:72px;line-height:1}
.score-track{flex:1;height:7px;background:var(--border);border-radius:4px;overflow:hidden}
.score-fill{height:100%;border-radius:4px;transition:width .8s cubic-bezier(.34,1.56,.64,1)}
.score-label{font-size:12px;color:var(--t2);white-space:nowrap}

.summary-row{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin-bottom:18px}
.scard{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px;position:relative;overflow:hidden}
.scard::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px}
.scard-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:var(--t2);margin-bottom:9px}
.scard-ver{font-family:var(--mono);font-size:22px;font-weight:500;color:var(--t1);margin-bottom:4px;line-height:1.2}
.scard-sub{font-size:11px;color:var(--t2);margin-bottom:9px}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.4px}
.badge.red{background:rgba(255,68,85,.12);color:var(--red);border:1px solid rgba(255,68,85,.3)}
.badge.green{background:rgba(27,217,122,.1);color:var(--green);border:1px solid rgba(27,217,122,.25)}
.badge.amber{background:rgba(245,166,35,.1);color:var(--amber);border:1px solid rgba(245,166,35,.25)}
.scard-btn{margin-top:11px;border-radius:5px;padding:6px 10px;font-family:var(--display);font-size:11px;font-weight:700;cursor:pointer;transition:background .15s;width:100%;border:1px solid rgba(245,166,35,.3);background:rgba(245,166,35,.1);color:var(--amber)}
.scard-btn:hover{background:rgba(245,166,35,.2)}
.scard-btn:disabled{opacity:.4;cursor:not-allowed}
.scard-btn.analyzing{color:var(--accent);border-color:rgba(6,207,224,.3);background:var(--accent-d);animation:blink 1s ease infinite}
.scard-btn.updating{color:var(--accent);border-color:rgba(6,207,224,.3);background:var(--accent-d);animation:blink 1s ease infinite}
.scard-btn.done{color:var(--green);border-color:rgba(27,217,122,.3);background:rgba(27,217,122,.08)}

.section-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}
.section-title{font-size:13px;font-weight:700}
.section-sub{font-size:11px;color:var(--t3)}
.ptable{background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:18px}
.pthead{display:grid;grid-template-columns:1fr 100px 100px 82px 120px;padding:8px 18px;border-bottom:1px solid var(--border);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:var(--t3)}
.prow{display:grid;grid-template-columns:1fr 100px 100px 82px 120px;padding:12px 18px;border-bottom:1px solid var(--border);align-items:center;transition:background .1s}
.prow:last-child{border-bottom:none}
.prow:hover{background:var(--surface2)}
.pname{font-size:12px;font-weight:700;color:var(--t1);display:flex;align-items:center;gap:6px}
.inactive-tag{font-size:9px;font-weight:700;color:var(--t3);background:var(--surface2);padding:1px 5px;border-radius:3px;border:1px solid var(--border)}
.pver{font-family:var(--mono);font-size:11px;color:var(--t2)}
.pver-new{font-family:var(--mono);font-size:11px;color:var(--amber);font-weight:500}
.pver-ok{font-family:var(--mono);font-size:11px;color:var(--t3)}
.upd-btn{border-radius:5px;padding:4px 9px;font-family:var(--display);font-size:10px;font-weight:700;cursor:pointer;transition:all .15s;white-space:nowrap;border:1px solid rgba(245,166,35,.3);background:rgba(245,166,35,.1);color:var(--amber)}
.upd-btn:hover{background:rgba(245,166,35,.2)}
.upd-btn:disabled{opacity:.4;cursor:not-allowed}
.upd-btn.analyzing{color:var(--accent);border-color:rgba(6,207,224,.3);background:var(--accent-d);animation:blink 1s ease infinite}
.upd-btn.updating{color:var(--accent);border-color:rgba(6,207,224,.3);background:var(--accent-d);animation:blink 1s ease infinite}
.upd-btn.done{color:var(--green);border-color:rgba(27,217,122,.3);background:rgba(27,217,122,.08);cursor:default}

.ai-panel{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:20px}
.ai-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.ai-title{font-size:13px;font-weight:800;display:flex;align-items:center;gap:8px}
.ai-spark{color:var(--accent);font-size:15px}
.ai-placeholder{text-align:center;padding:30px 20px;color:var(--t3);font-size:12px;line-height:1.8}
.ai-loading{display:flex;align-items:center;gap:10px;color:var(--accent);font-size:12px;padding:18px}
.spinner{width:14px;height:14px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0}
.ai-body{font-size:12px;line-height:1.85;color:var(--t2);white-space:pre-wrap}

/* ── Risk Modal ── */
.modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:300;padding:20px;animation:overlayIn .2s ease}
.modal-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;width:100%;max-width:540px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 32px 80px rgba(0,0,0,.8);animation:modalIn .25s cubic-bezier(.34,1.2,.64,1)}
.modal-hdr{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 14px;border-bottom:1px solid var(--border)}
.modal-title-row{display:flex;align-items:center;gap:8px}
.modal-icon{font-size:15px}
.modal-title{font-size:14px;font-weight:800;color:var(--t1)}
.modal-close{background:none;border:none;color:var(--t3);font-size:22px;cursor:pointer;line-height:1;padding:0 2px;transition:color .15s}
.modal-close:hover{color:var(--t1)}
.modal-plugin-section{padding:16px 22px 12px}
.modal-plugin-name{font-size:15px;font-weight:800;color:var(--t1);margin-bottom:6px}
.modal-version-flow{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:13px}
.modal-ver-old{color:var(--t3)}
.modal-ver-arrow{color:var(--t3)}
.modal-ver-new{color:var(--amber);font-weight:500}
.modal-risk-wrap{padding:0 22px 16px}
.modal-risk-badge{display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border-radius:20px;font-size:13px;font-weight:800}
.modal-divider{height:1px;background:var(--border);margin:0 22px}
.modal-analysis{padding:18px 22px;font-size:12px;line-height:1.85;color:var(--t2);white-space:pre-wrap;overflow-y:auto;flex:1;min-height:100px;max-height:280px}
.modal-footer{display:flex;gap:10px;padding:14px 22px;border-top:1px solid var(--border);justify-content:flex-end}
.modal-btn-cancel{background:transparent;border:1px solid var(--border);color:var(--t2);border-radius:6px;padding:8px 16px;font-family:var(--display);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s}
.modal-btn-cancel:hover{border-color:var(--accent);color:var(--accent)}
.modal-btn-confirm{border:none;border-radius:6px;padding:8px 18px;font-family:var(--display);font-size:12px;font-weight:800;cursor:pointer;transition:opacity .15s;background:var(--accent);color:#000}
.modal-btn-confirm:hover{opacity:.88}
.modal-btn-confirm.danger{background:var(--red);color:#fff}
.modal-all-info{padding:14px 22px;background:var(--surface2);margin:0;border-bottom:1px solid var(--border)}
.modal-all-items{font-size:11px;color:var(--t2);font-family:var(--mono);line-height:1.8}

.toast{position:fixed;bottom:20px;right:20px;background:var(--surface);border:1px solid var(--green);color:var(--green);padding:11px 16px;border-radius:8px;font-size:12px;font-weight:700;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideUp .3s ease;z-index:400}

@media(max-width:600px){
  .summary-row{grid-template-columns:1fr}
  .pthead,.prow{grid-template-columns:1fr 80px 90px}
  .pthead span:nth-child(2),.prow>*:nth-child(2),
  .pthead span:nth-child(4),.prow>*:nth-child(4){display:none}
  .hdr-time{display:none}
}
`;

/* ─── Components ────────────────────────────────────── */
function Setup({ form, setForm, onStart }) {
  return (
    <>
      <style>{STYLES}</style>
      <div className="setup">
        <div className="setup-card">
          <div className="logo-wrap">
            <div className="logo-box">🩺</div>
            <div className="logo-name">WP Health</div>
            <div className="logo-sub">WordPress Maintenance Dashboard</div>
          </div>
          <div className="field">
            <label>サイト URL</label>
            <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://example.com" />
          </div>
          <div className="field">
            <label>API キー</label>
            <input type="password" value={form.apiKey} onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))} placeholder="wph_xxxxxxxxxxxxxxxxxxxx" />
          </div>
          <button className="btn-primary" onClick={onStart}>スキャン開始</button>
          <div className="demo-note">
            💡 <strong>デモモード：</strong> デモデータで動作します。実サイトに繋ぐには「WP Health Agent」プラグインをインストールしてAPIキーを発行してください。
          </div>
        </div>
      </div>
    </>
  );
}

function Scanning({ log }) {
  return (
    <>
      <style>{STYLES}</style>
      <div className="scanning">
        <div className="scan-heading">サイトをスキャン中...</div>
        <div className="scan-box">
          {log.map((line, i) => (
            <div key={i} className="scan-line">
              <span className="scan-dot" style={{ background: i === log.length - 1 ? "var(--accent)" : "var(--green)", animation: i === log.length - 1 ? "pulse 1s ease infinite" : "none" }} />
              {line}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RiskModal({ modal, onCancel }) {
  if (!modal) return null;
  const isHigh = modal.riskLevel === "高";
  const isLow = modal.riskLevel === "低";
  const riskColor = isHigh ? "var(--red)" : isLow ? "var(--green)" : "var(--amber)";
  const riskBg = isHigh ? "rgba(255,68,85,.13)" : isLow ? "rgba(27,217,122,.1)" : "rgba(245,166,35,.1)";
  const riskBorder = isHigh ? "rgba(255,68,85,.35)" : isLow ? "rgba(27,217,122,.3)" : "rgba(245,166,35,.3)";
  const riskIcon = isHigh ? "🔴" : isLow ? "🟢" : "🟡";

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card">
        <div className="modal-hdr">
          <div className="modal-title-row">
            <span className="modal-icon">🔍</span>
            <span className="modal-title">更新前リスク分析</span>
          </div>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="modal-plugin-section">
          <div className="modal-plugin-name">
            {modal.isAllUpdate ? `一括更新（${modal.pendingCount}件）` : modal.plugin?.name}
          </div>
          {!modal.isAllUpdate && modal.plugin && (
            <div className="modal-version-flow">
              <span className="modal-ver-old">{modal.plugin.current}</span>
              <span className="modal-ver-arrow">──→</span>
              <span className="modal-ver-new">{modal.plugin.latest}</span>
            </div>
          )}
        </div>

        {modal.isAllUpdate && modal.allItems && (
          <div className="modal-all-info">
            <div className="modal-all-items">{modal.allItems.join("\n")}</div>
          </div>
        )}

        <div className="modal-risk-wrap">
          <div className="modal-risk-badge" style={{ background: riskBg, border: `1px solid ${riskBorder}`, color: riskColor }}>
            <span>{riskIcon}</span>
            <span>{modal.riskLevel}リスク</span>
          </div>
        </div>

        <div className="modal-divider" />
        <div className="modal-analysis">{modal.analysis}</div>
        <div className="modal-divider" />

        <div className="modal-footer">
          <button className="modal-btn-cancel" onClick={onCancel}>キャンセル</button>
          <button className={`modal-btn-confirm ${isHigh ? "danger" : ""}`} onClick={modal.onConfirm}>
            {isHigh ? "⚠ リスクを承知で更新する" : "内容を確認した上で更新する →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function scoreColor(s) { return s >= 80 ? "var(--green)" : s >= 55 ? "var(--amber)" : "var(--red)"; }
function scoreLabel(s) { return s >= 80 ? "良好" : s >= 55 ? "要対応" : "緊急"; }

function HealthScore({ score }) {
  const c = scoreColor(score);
  return (
    <div className="score-bar">
      <div className="score-num" style={{ color: c }}>{score}</div>
      <div className="score-track"><div className="score-fill" style={{ width: `${score}%`, background: c }} /></div>
      <div className="score-label">健康スコア <strong style={{ color: c }}>{scoreLabel(score)}</strong></div>
    </div>
  );
}

function WpCard({ data, state, onInitiate }) {
  const need = data.wordpress.updateAvailable && state !== "done";
  const c = need ? "var(--amber)" : "var(--green)";
  const btnLabel = { idle: `→ ${data.wordpress.latest} へ更新`, analyzing: "リスク分析中...", updating: "更新中...", done: "✓ 完了" }[state] || "更新する";
  return (
    <div className="scard" style={{ "--c": c }}>
      <div className="scard-label">WordPress Core</div>
      <div className="scard-ver">{data.wordpress.current}</div>
      <div className="scard-sub">最新: {data.wordpress.latest}</div>
      {need ? <span className="badge amber">⬆ 更新あり</span> : <span className="badge green">✓ 最新</span>}
      {need && <button className={`scard-btn ${state !== "idle" ? state : ""}`} onClick={onInitiate} disabled={state !== "idle"}>{btnLabel}</button>}
    </div>
  );
}

function PhpCard({ data }) {
  const eol = data.php.status === "eol";
  return (
    <div className="scard" style={{ "--c": eol ? "var(--red)" : "var(--green)" }}>
      <div className="scard-label">PHP バージョン</div>
      <div className="scard-ver">{data.php.current}</div>
      <div className="scard-sub">推奨: {data.php.recommended} 以上</div>
      {eol ? <span className="badge red">⚠ EOL・危険</span> : <span className="badge green">✓ 正常</span>}
      {eol && <div style={{ marginTop: 10, fontSize: 11, color: "var(--red)", lineHeight: 1.6 }}>PHP 7.4 は 2022年11月にサポート終了済みです。サーバー管理者にアップグレードを依頼してください。</div>}
    </div>
  );
}

function PluginsCard({ data }) {
  const pending = data.plugins.filter(p => p.updateAvailable).length;
  const c = pending === 0 ? "var(--green)" : pending <= 2 ? "var(--amber)" : "var(--red)";
  return (
    <div className="scard" style={{ "--c": c }}>
      <div className="scard-label">プラグイン</div>
      <div className="scard-ver">{data.plugins.length}<span style={{ fontSize: 14, color: "var(--t2)", marginLeft: 4 }}>個</span></div>
      <div className="scard-sub">更新待ち: {pending}個 / アクティブ: {data.plugins.filter(p => p.active).length}個</div>
      {pending === 0 ? <span className="badge green">✓ すべて最新</span> : <span className="badge red">{pending}件 要更新</span>}
    </div>
  );
}

function PluginRow({ plugin, state, onInitiate }) {
  const isActive = plugin.updateAvailable && state !== "done";
  const btnLabel = { idle: "更新する", analyzing: "分析中...", updating: "更新中...", done: "✓ 完了" }[state] || "更新する";
  const btnCls = `upd-btn ${["analyzing", "updating"].includes(state) ? state : state === "done" ? "done" : ""}`;
  return (
    <div className="prow">
      <div className="pname">{plugin.name}{!plugin.active && <span className="inactive-tag">無効</span>}</div>
      <div className="pver">{plugin.current}</div>
      <div>{isActive ? <span className="pver-new">{plugin.latest}</span> : <span className="pver-ok">{plugin.latest}</span>}</div>
      <div>{isActive ? <span className="badge amber">要更新</span> : <span className="badge green">最新</span>}</div>
      <div>
        {(isActive || ["analyzing", "updating"].includes(state))
          ? <button className={btnCls} onClick={onInitiate} disabled={state !== "idle"}>{btnLabel}</button>
          : <button className="upd-btn done" disabled>✓ 完了</button>}
      </div>
    </div>
  );
}

/* ─── Main App ──────────────────────────────────────── */
export default function App() {
  const [phase, setPhase] = useState("setup");
  const [form, setForm] = useState({ url: "https://example.com", apiKey: "wph_demo" });
  const [scanLog, setScanLog] = useState([]);
  const [data, setData] = useState(null);
  const [pluginState, setPluginState] = useState({});
  const [coreState, setCoreState] = useState("idle");
  const [riskModal, setRiskModal] = useState(null);
  const [ai, setAi] = useState({ loading: false, text: null });
  const [toast, setToast] = useState(null);
  const [analyzingAll, setAnalyzingAll] = useState(false);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  /* Scan */
  const scan = async () => {
    setPhase("scanning"); setScanLog([]); setPluginState({}); setCoreState("idle"); setAi({ loading: false, text: null });
    for (const step of SCAN_STEPS) {
      await sleep(380 + Math.random() * 320);
      setScanLog(prev => [...prev, step]);
    }
    await sleep(480);
    setData(JSON.parse(JSON.stringify(DEMO)));
    setPhase("dashboard");
  };

  /* Execute (after confirmation) */
  const executePluginUpdate = async (slug) => {
    setPluginState(prev => ({ ...prev, [slug]: "updating" }));
    await sleep(1200 + Math.random() * 700);
    setData(prev => ({ ...prev, plugins: prev.plugins.map(p => p.slug === slug ? { ...p, current: p.latest, updateAvailable: false } : p) }));
    setPluginState(prev => ({ ...prev, [slug]: "done" }));
    showToast(`✓ ${DEMO.plugins.find(p => p.slug === slug)?.name} を更新しました`);
  };

  const executeCoreUpdate = async () => {
    setCoreState("updating");
    await sleep(2200);
    setData(prev => ({ ...prev, wordpress: { ...prev.wordpress, current: prev.wordpress.latest, updateAvailable: false } }));
    setCoreState("done");
    showToast(`✓ WordPress を ${DEMO.wordpress.latest} に更新しました`);
  };

  /* Initiate (with risk analysis) */
  const initiatePluginUpdate = async (slug) => {
    setPluginState(prev => ({ ...prev, [slug]: "analyzing" }));
    try {
      const plugin = data.plugins.find(p => p.slug === slug);
      const { riskLevel, analysis } = await analyzeRisk(plugin, DEMO_FUNCTIONS_PHP);
      setRiskModal({ plugin, riskLevel, analysis, onConfirm: () => { setRiskModal(null); executePluginUpdate(slug); } });
    } catch {
      const plugin = data.plugins.find(p => p.slug === slug);
      setRiskModal({ plugin, riskLevel: "中", analysis: "リスク分析の取得に失敗しました。\n更新を実行する前にテスト環境での動作確認を推奨します。", onConfirm: () => { setRiskModal(null); executePluginUpdate(slug); } });
    }
    setPluginState(prev => ({ ...prev, [slug]: "idle" }));
  };

  const initiateCoreUpdate = async () => {
    setCoreState("analyzing");
    try {
      const fakePlugin = { name: "WordPress 本体", current: data.wordpress.current, latest: data.wordpress.latest };
      const { riskLevel, analysis } = await analyzeRisk(fakePlugin, DEMO_FUNCTIONS_PHP);
      setRiskModal({ plugin: fakePlugin, riskLevel, analysis, onConfirm: () => { setRiskModal(null); executeCoreUpdate(); } });
    } catch {
      setRiskModal({ plugin: { name: "WordPress 本体", current: data.wordpress.current, latest: data.wordpress.latest }, riskLevel: "中", analysis: "リスク分析の取得に失敗しました。バックアップ後に更新することを推奨します。", onConfirm: () => { setRiskModal(null); executeCoreUpdate(); } });
    }
    setCoreState("idle");
  };

  const initiateAllUpdates = async () => {
    setAnalyzingAll(true);
    const pendingPlugins = data.plugins.filter(p => p.updateAvailable);
    const pendingCore = data.wordpress.updateAvailable && coreState !== "done";
    const allItems = [];
    if (pendingCore) allItems.push(`WordPress 本体: ${data.wordpress.current} → ${data.wordpress.latest}`);
    pendingPlugins.forEach(p => allItems.push(`${p.name}: ${p.current} → ${p.latest}`));
    try {
      const { riskLevel, analysis } = await analyzeAllRisks(pendingPlugins, pendingCore ? data.wordpress : null, DEMO_FUNCTIONS_PHP);
      setRiskModal({
        isAllUpdate: true, pendingCount: allItems.length, allItems, riskLevel, analysis,
        onConfirm: async () => {
          setRiskModal(null);
          if (pendingCore) await executeCoreUpdate();
          for (const p of pendingPlugins) await executePluginUpdate(p.slug);
          showToast("🎉 すべての更新が完了しました！");
        }
      });
    } catch {
      setRiskModal({
        isAllUpdate: true, pendingCount: allItems.length, allItems, riskLevel: "中",
        analysis: "一括リスク分析の取得に失敗しました。各プラグインを個別に分析してから更新することを推奨します。",
        onConfirm: async () => {
          setRiskModal(null);
          if (pendingCore) await executeCoreUpdate();
          for (const p of pendingPlugins) await executePluginUpdate(p.slug);
        }
      });
    }
    setAnalyzingAll(false);
  };

  const runAI = async () => {
    setAi({ loading: true, text: null });
    const pluginUpdates = data.plugins.filter(p => p.updateAvailable).map(p => p.name).join("、");
    const prompt = `以下のWordPressサイト状態を分析し、優先度の高い順に課題と対応策を🔴🟡🟢で示しながら日本語3〜4段落で説明してください。\n\n- WordPress: ${data.wordpress.current}（最新: ${data.wordpress.latest}）\n- PHP: ${data.php.current}（${data.php.status === "eol" ? "EOL・危険" : "正常"}）\n- 更新待ちプラグイン: ${data.plugins.filter(p => p.updateAvailable).length}個（${pluginUpdates}）`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }) });
      const json = await res.json();
      setAi({ loading: false, text: json.content?.[0]?.text || "エラー" });
    } catch { setAi({ loading: false, text: "AI分析の取得に失敗しました。" }); }
  };

  const calcScore = d => {
    if (!d) return 0;
    let s = 100;
    if (d.php.status === "eol") s -= 35;
    if (d.wordpress.updateAvailable) s -= 20;
    s -= d.plugins.filter(p => p.updateAvailable).length * 7;
    return Math.max(s, 0);
  };

  if (phase === "setup") return <Setup form={form} setForm={setForm} onStart={scan} />;
  if (phase === "scanning") return <Scanning log={scanLog} />;

  const score = calcScore(data);
  const totalPending = (data.wordpress.updateAvailable && coreState !== "done" ? 1 : 0) + data.plugins.filter(p => p.updateAvailable && pluginState[p.slug] !== "done").length;

  return (
    <>
      <style>{STYLES}</style>
      <div className="dash">
        <header className="hdr">
          <span className="hdr-logo">WP Health</span>
          <span className="hdr-sep" />
          <span className="hdr-url">{data.site.url}</span>
          <span className="hdr-time">スキャン: {new Date().toLocaleTimeString("ja-JP")}</span>
          <button className="btn-sm" onClick={scan}>再スキャン</button>
          {totalPending > 0 && (
            <button className="btn-accent" onClick={initiateAllUpdates} disabled={analyzingAll}>
              {analyzingAll ? "一括分析中..." : `一括リスク分析 + 更新 (${totalPending}件)`}
            </button>
          )}
        </header>

        <div className="content">
          <HealthScore score={score} />
          <div className="summary-row">
            <WpCard data={data} state={coreState} onInitiate={initiateCoreUpdate} />
            <PhpCard data={data} />
            <PluginsCard data={data} />
          </div>

          <div className="section-hdr">
            <span className="section-title">インストール済みプラグイン</span>
            <span className="section-sub">{data.plugins.filter(p => p.updateAvailable).length}件の更新待ち / 全{data.plugins.length}個</span>
          </div>
          <div className="ptable">
            <div className="pthead">
              <span>プラグイン名</span><span>現在</span><span>最新</span><span>状態</span><span></span>
            </div>
            {data.plugins.map(plugin => (
              <PluginRow key={plugin.slug} plugin={plugin} state={pluginState[plugin.slug] || "idle"} onInitiate={() => initiatePluginUpdate(plugin.slug)} />
            ))}
          </div>

          <div className="ai-panel">
            <div className="ai-hdr">
              <span className="ai-title"><span className="ai-spark">✦</span> AI 診断レポート</span>
              <button className="btn-accent" onClick={runAI} disabled={ai.loading}>{ai.loading ? "分析中..." : "Claude で分析する"}</button>
            </div>
            {ai.loading && <div className="ai-loading"><div className="spinner" />サイト状態を分析しています...</div>}
            {ai.text && <div className="ai-body">{ai.text}</div>}
            {!ai.loading && !ai.text && <div className="ai-placeholder">「Claude で分析する」を押すと、AIがサイトの状態を診断し<br />優先度の高い順に対応事項をまとめたレポートを生成します。</div>}
          </div>
        </div>
      </div>

      <RiskModal modal={riskModal} onCancel={() => setRiskModal(null)} />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
