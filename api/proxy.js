export default async function handler(req, res) {
  const { siteUrl, apiKey, path } = req.query;
  const body = req.method === 'POST' ? JSON.stringify(req.body) : null;

  try {
    const response = await fetch(
      `${siteUrl}/wp-json/wp-health/v1${path}`,
      {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'X-WPH-Key': apiKey,
        },
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
