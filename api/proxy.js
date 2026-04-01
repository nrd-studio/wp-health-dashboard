const https = require('https');
const http = require('http');

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-WPH-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  var siteUrl = req.query.siteUrl;
  var apiKey  = req.query.apiKey;
  var path    = req.query.path;

  if (!siteUrl || !apiKey || !path) {
    res.status(400).json({ error: 'siteUrl, apiKey, path は必須です' });
    return;
  }

  var targetUrl = siteUrl + '/wp-json/wp-health/v1' + path;
  var parsed;

  try {
    parsed = new URL(targetUrl);
  } catch(e) {
    res.status(400).json({ error: '無効なURL: ' + targetUrl });
    return;
  }

  var isHttps = parsed.protocol === 'https:';
  var lib = isHttps ? https : http;

  var bodyData = null;
  if (req.method === 'POST' && req.body) {
    bodyData = JSON.stringify(req.body);
  }

  var headers = {
    'Content-Type': 'application/json',
    'X-WPH-Key': apiKey
  };
  if (bodyData) {
    headers['Content-Length'] = Buffer.byteLength(bodyData);
  }

  var options = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: req.method,
    headers: headers
  };

  var proxyReq = lib.request(options, function(proxyRes) {
    var data = '';
    proxyRes.on('data', function(chunk) {
      data += chunk;
    });
    proxyRes.on('end', function() {
      var parsed;
      try {
        parsed = JSON.parse(data);
        res.status(proxyRes.statusCode).json(parsed);
      } catch(e) {
        res.status(proxyRes.statusCode).json({ raw: data });
      }
    });
  });

  proxyReq.on('error', function(e) {
    res.status(500).json({
      error: e.message,
      code: e.code,
      targetUrl: targetUrl
    });
  });

  if (bodyData) {
    proxyReq.write(bodyData);
  }
  proxyReq.end();
};
