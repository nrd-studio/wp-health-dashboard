<?php
/**
 * Plugin Name: WP Health Agent
 * Description: WP Health Dashboard との連携エージェント。v1.2でCORS問題を修正。
 * Version:     1.3.0
 */

defined('ABSPATH') || exit;

define('WPHA_VERSION',    '1.3.0');
define('WPHA_OPTION_KEY', 'wpha_api_key');
define('WPHA_NS',         'wp-health/v1');

/* ══════════════════════════════════════════════════════
 * CORS：すべてのREST APIリクエストの前に設定
 * ══════════════════════════════════════════════════════ */
add_action('init', function () {
    // OPTIONSプリフライトリクエストはここで即座に返す
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        if (isset($_SERVER['HTTP_ORIGIN'])) {
            header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
        } else {
            header('Access-Control-Allow-Origin: *');
        }
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-WPH-Key, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Max-Age: 86400');
        status_header(200);
        exit();
    }
});

add_filter('rest_pre_serve_request', function ($served, $result, $request, $server) {
    if (isset($_SERVER['HTTP_ORIGIN'])) {
        header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    } else {
        header('Access-Control-Allow-Origin: *');
    }
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Headers: Content-Type, X-WPH-Key, Authorization');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    return $served;
}, 10, 4);

/* ══════════════════════════════════════════════════════
 * REST API エンドポイント登録
 * ══════════════════════════════════════════════════════ */
add_action('rest_api_init', function () {
    register_rest_route(WPHA_NS, '/status',       ['methods' => 'GET',  'callback' => 'wpha_status',       'permission_callback' => 'wpha_auth']);
    register_rest_route(WPHA_NS, '/theme-files',  ['methods' => 'GET',  'callback' => 'wpha_theme_files',  'permission_callback' => 'wpha_auth']);
    register_rest_route(WPHA_NS, '/update/core',  ['methods' => 'POST', 'callback' => 'wpha_update_core',  'permission_callback' => 'wpha_auth']);
    register_rest_route(WPHA_NS, '/update/plugin',['methods' => 'POST', 'callback' => 'wpha_update_plugin','permission_callback' => 'wpha_auth',
        'args' => ['slug' => ['required' => true, 'sanitize_callback' => 'sanitize_key']]]);
    register_rest_route(WPHA_NS, '/update/all',   ['methods' => 'POST', 'callback' => 'wpha_update_all',   'permission_callback' => 'wpha_auth']);
});

/* ══════════════════════════════════════════════════════
 * 認証
 * ══════════════════════════════════════════════════════ */
function wpha_auth(WP_REST_Request $req): bool {
    $stored   = get_option(WPHA_OPTION_KEY, '');
    $provided = $req->get_header('X-WPH-Key');
    return !empty($stored) && hash_equals($stored, (string) $provided);
}

/* ══════════════════════════════════════════════════════
 * ステータス取得
 * ══════════════════════════════════════════════════════ */
function wpha_status(): WP_REST_Response {
    // wp-admin のファイルを読み込んでから更新チェック関数を呼ぶ
    require_once ABSPATH . 'wp-admin/includes/update.php';
    wp_version_check();   // wp_update_core() の代替（REST APIでも動く）
    wp_update_plugins();

    global $wp_version;
    $cu        = get_site_transient('update_core');
    $wp_latest = $wp_version;
    foreach (($cu->updates ?? []) as $u) {
        if ($u->response === 'upgrade') { $wp_latest = $u->version; break; }
    }

    $php        = PHP_VERSION;
    $php_status = version_compare($php, '8.0', '>=') ? 'ok'
                : (version_compare($php, '7.4', '>=') ? 'eol' : 'critical');

    if (!function_exists('get_plugins')) {
        require_once ABSPATH . 'wp-admin/includes/plugin.php';
    }
    $all    = get_plugins();
    $active = get_option('active_plugins', []);
    $pu     = get_site_transient('update_plugins');

    $plugins = [];
    foreach ($all as $file => $d) {
        $slug   = dirname($file);
        if ($slug === '.') $slug = basename($file, '.php');
        $latest = $d['Version'];
        $upd    = false;
        if (!empty($pu->response[$file])) {
            $latest = $pu->response[$file]->new_version;
            $upd    = true;
        }
        $plugins[] = [
            'slug'            => $slug,
            'file'            => $file,
            'name'            => $d['Name'],
            'current'         => $d['Version'],
            'latest'          => $latest,
            'updateAvailable' => $upd,
            'active'          => in_array($file, $active, true),
        ];
    }

    return new WP_REST_Response([
        'success'   => true,
        'site'      => ['name' => get_bloginfo('name'), 'url' => get_site_url()],
        'wordpress' => [
            'current'         => $wp_version,
            'latest'          => $wp_latest,
            'updateAvailable' => version_compare($wp_latest, $wp_version, '>'),
        ],
        'php'       => ['current' => $php, 'recommended' => '8.2', 'status' => $php_status],
        'plugins'   => $plugins,
        'checkedAt' => current_time('c'),
    ], 200);
}

/* ══════════════════════════════════════════════════════
 * テーマファイル取得
 * ══════════════════════════════════════════════════════ */
function wpha_theme_files(): WP_REST_Response {
    $theme = wp_get_theme();
    $dir   = get_stylesheet_directory();

    $php_files = glob($dir . '/*.php') ?: [];
    foreach (['inc', 'includes', 'lib', 'functions', 'helpers'] as $sub) {
        $found = glob($dir . '/' . $sub . '/*.php');
        if ($found) $php_files = array_merge($php_files, $found);
    }
    usort($php_files, fn($a, $b) => basename($a) === 'functions.php' ? -1 : 1);

    $files = []; $total = 0; $max_total = 40000; $max_file = 10000;
    foreach ($php_files as $file) {
        if ($total >= $max_total) break;
        $size    = filesize($file);
        if ($size > 200000) continue;
        $content = file_get_contents($file);
        if ($content === false) continue;
        if (strlen($content) > $max_file)
            $content = substr($content, 0, $max_file) . "\n// ↑ ({$max_file}文字で切り捨て)";
        $total += strlen($content);
        $files[] = [
            'name'      => basename($file),
            'path'      => str_replace($dir . '/', '', $file),
            'sizeBytes' => $size,
            'content'   => $content,
        ];
    }

    return new WP_REST_Response([
        'success'    => true,
        'theme'      => ['name' => $theme->get('Name'), 'version' => $theme->get('Version'), 'dir' => $dir],
        'files'      => $files,
        'totalFiles' => count($files),
        'totalChars' => $total,
    ], 200);
}

/* ══════════════════════════════════════════════════════
 * WordPress本体 更新
 * ══════════════════════════════════════════════════════ */
function wpha_update_core(): WP_REST_Response {
    foreach (['update', 'upgrade', 'file', 'misc', 'class-wp-upgrader', 'class-automatic-upgrader-skin'] as $f)
        require_once ABSPATH . 'wp-admin/includes/' . $f . '.php';

    $cu = get_site_transient('update_core');
    if (empty($cu->updates)) return new WP_REST_Response(['success' => true, 'message' => '更新なし'], 200);
    $u = $cu->updates[0];
    if ($u->response !== 'upgrade') return new WP_REST_Response(['success' => true, 'message' => '最新版'], 200);

    $r = (new Core_Upgrader(new Automatic_Upgrader_Skin()))->upgrade($u, ['attempt_rollback' => true]);
    if (is_wp_error($r)) return new WP_REST_Response(['success' => false, 'message' => $r->get_error_message()], 500);

    return new WP_REST_Response(['success' => true, 'message' => "WordPress を {$u->version} に更新しました", 'newVersion' => $u->version], 200);
}

/* ══════════════════════════════════════════════════════
 * プラグイン個別更新
 * ══════════════════════════════════════════════════════ */
function wpha_update_plugin(WP_REST_Request $req): WP_REST_Response {
    foreach (['plugin', 'file', 'misc', 'class-wp-upgrader', 'class-automatic-upgrader-skin', 'update'] as $f)
        require_once ABSPATH . 'wp-admin/includes/' . $f . '.php';

    $slug = $req->get_param('slug');

    // キャッシュを強制リフレッシュ（複数連続更新時の404対策）
    wp_update_plugins();
    $pu = get_site_transient('update_plugins');

    // 更新リストから検索
    $plugin_file = null;
    foreach (($pu->response ?? []) as $file => $info) {
        $fs = dirname($file);
        if ($fs === '.') $fs = basename($file, '.php');
        if ($fs === $slug) { $plugin_file = $file; break; }
    }

    // 更新リストにない場合：インストール済みリストで確認（既に最新の可能性）
    if (!$plugin_file) {
        if (!function_exists('get_plugins')) {
            require_once ABSPATH . 'wp-admin/includes/plugin.php';
        }
        foreach (get_plugins() as $file => $data) {
            $fs = dirname($file);
            if ($fs === '.') $fs = basename($file, '.php');
            if ($fs === $slug) {
                return new WP_REST_Response([
                    'success'    => true,
                    'message'    => "「{$slug}」はすでに最新版です",
                    'newVersion' => $data['Version'],
                ], 200);
            }
        }
        return new WP_REST_Response(['success' => false, 'message' => "「{$slug}」が見つかりません"], 404);
    }

    // 更新前にアクティブ状態を記憶
    $was_active = is_plugin_active($plugin_file);

    $r  = (new Plugin_Upgrader(new Automatic_Upgrader_Skin()))->upgrade($plugin_file);
    if (is_wp_error($r)) return new WP_REST_Response(['success' => false, 'message' => $r->get_error_message()], 500);

    // REST API経由では管理画面コンテキストがないため、アクティブだったプラグインを手動で再有効化
    if ($was_active && !is_plugin_active($plugin_file)) {
        activate_plugin($plugin_file);
    }

    $nv = $pu->response[$plugin_file]->new_version ?? '不明';
    return new WP_REST_Response(['success' => true, 'message' => "「{$slug}」を {$nv} に更新", 'newVersion' => $nv], 200);
}

/* ══════════════════════════════════════════════════════
 * 全更新
 * ══════════════════════════════════════════════════════ */
function wpha_update_all(): WP_REST_Response {
    $results = ['core' => wpha_update_core()->get_data(), 'plugins' => []];
    foreach (wpha_status()->get_data()['plugins'] as $p) {
        if ($p['updateAvailable']) {
            $req = new WP_REST_Request('POST');
            $req->set_param('slug', $p['slug']);
            $results['plugins'][$p['slug']] = wpha_update_plugin($req)->get_data();
        }
    }
    return new WP_REST_Response(['success' => true, 'results' => $results], 200);
}

/* ══════════════════════════════════════════════════════
 * 管理画面：APIキー設定ページ
 * ══════════════════════════════════════════════════════ */
add_action('admin_menu', fn() => add_options_page(
    'WP Health Agent', 'WP Health Agent', 'manage_options', 'wp-health-agent', 'wpha_settings_page'
));

function wpha_settings_page(): void {
    if (isset($_POST['wpha_generate']) && check_admin_referer('wpha_nonce')) {
        update_option(WPHA_OPTION_KEY, 'wph_' . bin2hex(random_bytes(20)));
        echo '<div class="notice notice-success"><p>新しいAPIキーを生成しました。</p></div>';
    }
    $key      = get_option(WPHA_OPTION_KEY, '');
    $base_url = get_site_url() . '/wp-json/wp-health/v1';
    ?>
    <div class="wrap">
        <h1>WP Health Agent <span style="font-size:13px;color:#666">v<?= WPHA_VERSION ?></span></h1>

        <h2>APIキー</h2>
        <?php if ($key): ?>
            <p><input type="text" value="<?= esc_attr($key) ?>" style="width:480px;font-family:monospace;font-size:13px" readonly onclick="this.select()"></p>
            <p class="description" style="color:#d63638">⚠ このキーは外部に漏らさないでください。漏れた場合はすぐに再生成してください。</p>
        <?php else: ?>
            <p><em>まだ生成されていません。下のボタンで生成してください。</em></p>
        <?php endif; ?>
        <form method="post" style="margin-top:12px">
            <?php wp_nonce_field('wpha_nonce') ?>
            <button type="submit" name="wpha_generate" class="button button-primary">
                <?= $key ? 'APIキーを再生成' : 'APIキーを生成' ?>
            </button>
        </form>

        <h2 style="margin-top:32px">接続テスト</h2>
        <p>以下のURLをブラウザで開いてJSONが表示されれば正常に動作しています：</p>
        <p><a href="<?= esc_url($base_url . '/status') ?>" target="_blank"><code><?= esc_html($base_url . '/status') ?></code></a></p>
        <p style="color:#d63638;font-size:12px">※ ブラウザで開いてもAPIキーの認証エラーが出ますが、エンドポイントが存在すること自体は確認できます。</p>

        <h2 style="margin-top:32px">エンドポイント一覧</h2>
        <table class="widefat" style="max-width:720px">
            <thead><tr><th>Method</th><th>URL</th><th>説明</th></tr></thead>
            <tbody>
                <tr><td>GET</td> <td><code>/wp-health/v1/status</code></td>       <td>バージョン・更新情報取得</td></tr>
                <tr><td>GET</td> <td><code>/wp-health/v1/theme-files</code></td>  <td>テーマPHP取得（AIリスク分析用）</td></tr>
                <tr><td>POST</td><td><code>/wp-health/v1/update/core</code></td>  <td>WordPress本体を更新</td></tr>
                <tr><td>POST</td><td><code>/wp-health/v1/update/plugin</code></td><td>プラグインを更新（body: slug）</td></tr>
                <tr><td>POST</td><td><code>/wp-health/v1/update/all</code></td>   <td>すべてを一括更新</td></tr>
            </tbody>
        </table>
    </div>
    <?php
}

/**
 * WP Health Agent — コア自動更新ポリシー 検知・制御
 *
 *
 * 追加されるエンドポイント:
 *   GET  /wp-json/wp-health/v1/auto-update        … ポリシーの取得
 *   POST /wp-json/wp-health/v1/auto-update/major  … メジャー自動更新のON/OFF
 *        body: { "enabled": true | false }
 */

add_action( 'rest_api_init', function () {
	register_rest_route( WPHA_NS, '/auto-update', array(
		'methods'             => 'GET',
		'callback'            => 'wpha_get_auto_update_policy',
		'permission_callback' => 'wpha_auth',
	) );
	register_rest_route( WPHA_NS, '/auto-update/major', array(
		'methods'             => 'POST',
		'callback'            => 'wpha_set_major_auto_update',
		'permission_callback' => 'wpha_auth',
	) );
} );

/**
 * 自動更新ポリシーの現在値を、WordPress コアと同じ優先順位で判定して返す。
 *
 * 優先順位:
 *   1. AUTOMATIC_UPDATER_DISABLED 定数（自動更新システム全体の停止）
 *   2. WP_AUTO_UPDATE_CORE 定数（wp-config.php）
 *      true = すべて自動 / false = すべて停止 / 'minor' = マイナーのみ
 *   3. auto_update_core_major サイトオプション
 *      （管理画面「すべての新バージョンに自動更新」チェックボックスの実体）
 *   4. allow_major/minor_auto_core_updates フィルター（プラグイン等による上書き）
 *
 * ※ ホスティング会社が WordPress の外側で行う独自の更新サービスはここでは検知できません。
 */
function wpha_get_auto_update_policy(): WP_REST_Response {
	if ( ! class_exists( 'WP_Automatic_Updater' ) ) {
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	}

	$updater          = new WP_Automatic_Updater();
	$updater_disabled = $updater->is_disabled();
	$constant_defined = defined( 'WP_AUTO_UPDATE_CORE' );
	$constant_value   = $constant_defined ? WP_AUTO_UPDATE_CORE : null;
	$option_major     = get_site_option( 'auto_update_core_major', 'unset' );

	if ( $constant_defined ) {
		$major        = ( true === $constant_value );
		$minor        = ( true === $constant_value || 'minor' === $constant_value );
		$source_label = 'wp-config.php の WP_AUTO_UPDATE_CORE 定数 (' . var_export( $constant_value, true ) . ')';
	} else {
		$major        = ( 'enabled' === $option_major );
		$minor        = true; // WordPress デフォルト: マイナーは自動更新
		$source_label = ( 'enabled' === $option_major || 'disabled' === $option_major )
			? '管理画面の設定 (DBオプション)'
			: 'WordPress デフォルト (マイナーのみ自動)';
	}

	// プラグイン・テーマのフィルターによる上書きを反映
	$major_final = (bool) apply_filters( 'allow_major_auto_core_updates', $major );
	$minor_final = (bool) apply_filters( 'allow_minor_auto_core_updates', $minor );
	$filtered    = ( $major_final !== $major || $minor_final !== $minor );
	if ( $filtered ) {
		$source_label .= ' ＋ フィルターによる上書きあり';
	}

	return rest_ensure_response( array(
		'major_enabled'    => $major_final && ! $updater_disabled,
		'minor_enabled'    => $minor_final && ! $updater_disabled,
		'updater_disabled' => $updater_disabled,
		'constant_defined' => $constant_defined,
		'constant_value'   => is_bool( $constant_value ) ? var_export( $constant_value, true ) : $constant_value,
		'option_major'     => $option_major,
		'filtered'         => $filtered,
		'source_label'     => $source_label,
		'locked'           => ( $constant_defined || $filtered ),
	) );
}

/**
 * メジャーバージョン自動更新の ON/OFF を切り替える。
 *
 * DBオプション (auto_update_core_major) のみを変更します。
 * wp-config.php の定数が定義されている場合はそちらが優先されるため、
 * 409 を返して変更を拒否します（誤った安心感を与えないための設計）。
 */
function wpha_set_major_auto_update( WP_REST_Request $request ) {
	if ( defined( 'WP_AUTO_UPDATE_CORE' ) ) {
		return new WP_Error(
			'wpha_locked_by_constant',
			'wp-config.php の WP_AUTO_UPDATE_CORE 定数が優先されるため、ここからは変更できません。wp-config.php を直接編集してください。',
			array( 'status' => 409 )
		);
	}

	$enabled = filter_var( $request->get_param( 'enabled' ), FILTER_VALIDATE_BOOLEAN );
	update_site_option( 'auto_update_core_major', $enabled ? 'enabled' : 'disabled' );

	// 変更後の最新ポリシーを返す（ダッシュボード側はこれで state を更新する）
	return wpha_get_auto_update_policy();
}
