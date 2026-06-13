// Server-side proxy for HERE Geocoding API.
// Keeps HERE_API_KEY off the browser — reads from Vercel environment variable.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query.q || '';
  if (!q) return res.status(200).json({ items: [] });

  const key = process.env.HERE_API_KEY;
  if (!key) return res.status(500).json({ error: 'HERE_API_KEY not configured' });

  try {
    const url = 'https://geocode.search.hereapi.com/v1/geocode'
      + '?q='    + encodeURIComponent(q)
      + '&apiKey=' + key
      + '&in=bbox:-95.17,41.65,-74.33,56.87';

    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    res.status(200).json(d);
  } catch (e) {
    res.status(200).json({ items: [] });
  }
};
