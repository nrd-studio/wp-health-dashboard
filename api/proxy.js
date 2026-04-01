const https = require('https');
const http = require('http');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-WPH-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { siteUrl, apiKey, path } = req.query;
  if (!siteUrl || !apiKey || !path) {
    return res.status(400).json({ error: 'siteUrl, apiKey, path は必須です' });
  }

  const targetUrl = `${siteUrl}/wp-json/wp-health/v1${path}`;

  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch(e) {
    return res.status(400).json({ error: '無効なURL: ' + targetUrl });
  }

  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;
  const body = (req.method === 'POST' && req.body)
    ? JSON.stringify(req.body) : null;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'X-WPH-Key': apiKey,
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
    },
  };

  return new Promise((resolve) => {
    const proxyReq = lib.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          // WordPressからのレスポンスをそのまま返す（ステータスコード含む）
          const parsed = JSON.parse(data);
          res.status(proxyRes.statusCode).json(parsed);
        } catch {
          res.status(proxyRes.statusCode).json({ raw: data });
        }
        resolve();
      });
    });

    proxyReq.on('error', (e) => {
      res.status(500).json({
        error: e.message,
        code: e.code,
        targetUrl,
      });
      resolve();
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  });
};
```

Commitしてデプロイ完了後、ブラウザで直接このURLを開いてみてください（APIキーはご自身のものに変えて）：
```
https://wp-health-dashboard-eight.vercel.app/api/proxy?siteUrl=https://nextmessage.nrd-studio.com&apiKey=あなたのキー&path=/status
