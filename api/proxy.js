export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { targetUrl } = req.query;
  if (!targetUrl) {
    return res.status(400).json({ error: 'Missing targetUrl parameter' });
  }

  try {
    const headers = {
      'Accept': req.headers['accept'] || 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const targetRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });

    const contentType = targetRes.headers.get('content-type') || '';
    const text = await targetRes.text();

    res.status(targetRes.status);
    if (contentType.includes('application/json')) {
      res.setHeader('Content-Type', 'application/json');
      try {
        return res.json(JSON.parse(text));
      } catch {
        return res.send(text);
      }
    }

    res.setHeader('Content-Type', contentType || 'text/plain');
    return res.send(text);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Proxy request failed' });
  }
}
