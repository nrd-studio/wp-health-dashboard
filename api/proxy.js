export const config = {
  api: { bodyParser: true }
};

export default async function handler(req, res) {
  // CORSヘッダーを常に付与
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-WPH-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  // OPTIONSプリフライトはここで返す
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { siteUrl, apiKey, path } = req.query;

  if (!siteUrl || !apiKey || !path) {
    return res.status(400).json({ error: 'siteUrl, apiKey, path は必須です' });
  }

  const targetUrl = `${siteUrl}/wp-json/wp-health/v1${path}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-WPH-Key': apiKey,
      },
    };

    if (req.method === 'POST' && req.body) {
      fetchOptions.body = JSON.stringify(req.body);
    }

    const response = await fetch(targetUrl, fetchOptions);
    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return res.status(response.status).json(data);

  } catch (e) {
    return res.status(500).json({
      error: e.message,
      targetUrl,
    });
  }
