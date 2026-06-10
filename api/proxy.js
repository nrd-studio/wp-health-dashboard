const PRIVATE_IP = /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.|::1$|fc|fd)/i;
const VALID_PATH  = /^\/[A-Za-z0-9/_-]*$/;

function validateSiteUrl(raw) {
    let url;
    try { url = new URL(raw); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    if (PRIVATE_IP.test(url.hostname)) return null;
    // strip any path/query from the origin so callers can't smuggle extra segments
    return url.origin;
}

export default async function handler(req, res) {
    const { siteUrl, path } = req.query;
    // ヘッダ優先（URLログへのキー残留対策）、クエリは後方互換
    const apiKey = req.headers['x-wph-key'] || req.query.apiKey;

    const origin = validateSiteUrl(siteUrl);
    if (!origin) {
        return res.status(400).json({ error: '無効な siteUrl です' });
    }
    if (!VALID_PATH.test(path)) {
        return res.status(400).json({ error: '無効な path です' });
    }
    if (!apiKey) {
        return res.status(400).json({ error: 'APIキーがありません（X-WPH-Key ヘッダ）' });
    }

    const body = req.method === 'POST' ? JSON.stringify(req.body) : null;

    try {
        const response = await fetch(
            `${origin}/wp-json/wp-health/v1${path}`,
            {
                method: req.method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-WPH-Key': apiKey,
                },
                redirect: 'manual',
                ...(body ? { body } : {}),
            }
        );
        // リダイレクト応答はJSONを持たないため明示的にエラー化（www有無・https正規化のミス検出用）
        if (response.status >= 300 && response.status < 400) {
            return res.status(502).json({
                error: 'サイトがリダイレクトを返しました。siteUrl を最終的なURL（www有無・httpsを正確に）で入力してください。',
                location: response.headers.get('location') || '',
            });
        }
        const data = await response.json();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
