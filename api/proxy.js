const https = require('https');
const http = require('http');
const url = require('url');

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
  const parsed = url.parse(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  const body = (req.method === 'POST' && req.body)
    ? JSON.stringify(req.body) : null;

  const options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.path,
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'X-WPH-Key': apiKey,
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
