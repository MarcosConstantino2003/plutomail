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

  let targetHost = '';
  try {
    targetHost = new URL(targetUrl).hostname;
  } catch {
    return res.status(400).json({ error: 'Invalid targetUrl parameter' });
  }

  // Mimic a request coming from the provider's own web app (mail.tm / mail.gw),
  // not from the API host itself — closer to what their anti-bot checks expect.
  const frontendOrigin = `https://${targetHost.replace(/^api\./, '')}`;

  const headers = {
    'Accept': req.headers['accept'] || 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Origin': frontendOrigin,
    'Referer': `${frontendOrigin}/`,
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

  // mail.tm/mail.gw occasionally hang or reset connections when hit from
  // shared serverless IPs. Retry a couple of times with a short timeout
  // instead of surfacing a hard 500 on the very first hiccup.
  const MAX_ATTEMPTS = 3;
  let lastErr = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const targetRes = await fetch(targetUrl, {
        method: req.method,
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const contentType = targetRes.headers.get('content-type') || '';
      const text = await targetRes.text();

      // Some upstreams return a transient 5xx / 429 (rate limiting) — retry those too.
      if ((targetRes.status >= 500 || targetRes.status === 429) && attempt < MAX_ATTEMPTS) {
        lastErr = new Error(`Upstream returned ${targetRes.status}`);
        await new Promise((r) => setTimeout(r, attempt * 400));
        continue;
      }

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
      clearTimeout(timeout);
      lastErr = err.name === 'AbortError' ? new Error('Upstream request timed out') : err;
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 400));
        continue;
      }
    }
  }

  return res.status(502).json({
    error: lastErr?.message || 'Proxy request failed after retries',
    targetUrl,
  });
}
