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
    const { siteUrl, apiKey, path } = req.query;

    const origin = validateSiteUrl(siteUrl);
    if (!origin) {
        return res.status(400).json({ error: '無効な siteUrl です' });
    }
    if (!VALID_PATH.test(path)) {
        return res.status(400).json({ error: '無効な path です' });
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
        const data = await response.json();
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(response.status).json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
