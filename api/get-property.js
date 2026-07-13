// Building footprint lookup for the roofing estimator.
//
// Lookup order:
//   1. Microsoft Canadian Building Footprints (tile served from Vercel Blob)
//      — AI-generated from Bing aerial imagery; covers all of GTA
//   2. OSM / Overpass API (fallback for tiles not yet uploaded or missing)
//
// Returns:
//   footprintSqFt  — total area of all buildings on the property
//   perimeterFt    — total perimeter of all buildings
//   polygon        — main building polygon [[lon,lat],...] for map display
//   buildings      — array of individual buildings
//   source         — 'msft' | 'osm' | 'not-found' | 'error'
//
// On any failure the response is 200 with null values — UI falls back to manual entry.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { lat, lng } = req.body || {};
  if (!lat || !lng) {
    return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'missing-coords' });
  }

  try {
    // 1. Try Microsoft tile (fast, ~25 KB fetch)
    const msft = await msftLookup(lat, lng);
    if (msft) return res.status(200).json(msft);

    // 2. Fall back to OSM / Overpass
    const osm = await osmLookup(lat, lng);
    if (osm) return res.status(200).json(osm);

    return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'not-found' });

  } catch (e) {
    return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'error' });
  }
};

// ── Microsoft tile lookup ─────────────────────────────────────────────────────
// Each tile covers 0.02° × 0.02° (~2.2 km lat × ~1.6 km lng at GTA latitudes).
// Tiles are stored as [[lon,lat],...] arrays (one ring per building, no properties).
// Public Supabase Storage bucket — no auth header needed.
const TILE_SIZE = 0.02;

async function msftLookup(lat, lng) {
  const baseUrl = process.env.MSFT_TILES_BASE_URL;
  if (!baseUrl) return null;

  const tileKey = `${Math.floor(lat / TILE_SIZE)}_${Math.floor(lng / TILE_SIZE)}`;
  try {
    const r = await fetch(`${baseUrl}/${tileKey}.json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null; // 404 = no buildings in this tile

    const rings = await r.json();
    if (!Array.isArray(rings) || rings.length === 0) return null;

    // Pick nearest building centroid within 30m
    let best = null, bestDist = Infinity;
    for (const ring of rings) {
      const d = distM(+lng, +lat, ...centroidOf(ring));
      if (d < bestDist) { bestDist = d; best = ring; }
    }
    if (!best || bestDist > 30) return null;

    const footprintSqFt = Math.round(polygonAreaM2(best) * 10.7639);
    const perimeterFt   = Math.round(polygonPerimM(best) * 3.28084);

    return {
      footprintSqFt,
      perimeterFt,
      polygon: best,
      buildings: [{ label: 'Main Building', footprintSqFt, perimeterFt, polygon: best, osmId: null, osmTags: {} }],
      source: 'msft',
    };
  } catch (_) { return null; }
}

// ── OSM / Overpass lookup ─────────────────────────────────────────────────────
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const GARAGE_TAGS = /^(garage|carport|shed|outbuilding|hut|barn|storage_tank|storage|farm_auxiliary)$/;

async function osmLookup(lat, lng) {
  const q = `[out:json][timeout:8];way[building](around:30,${lat},${lng});out geom qt;`;

  let r;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      r = await fetch(`${endpoint}?data=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(9000) });
      if (r.ok) break;
    } catch (_) { /* try next */ }
  }
  if (!r || !r.ok) throw new Error('All Overpass endpoints failed');

  const data = await r.json();
  const ways = (data.elements || []).filter(e => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4);
  if (ways.length === 0) return null;

  const buildings = ways.map(w => {
    let coords = w.geometry.map(g => [g.lon, g.lat]);
    const [f, l] = [coords[0], coords[coords.length - 1]];
    if (f[0] !== l[0] || f[1] !== l[1]) coords.push([...f]);
    const tag   = (w.tags || {}).building || 'yes';
    const label = GARAGE_TAGS.test(tag) ? 'Garage / Outbuilding' : 'Main Building';
    return { label, footprintSqFt: Math.round(polygonAreaM2(coords) * 10.7639),
             perimeterFt: Math.round(polygonPerimM(coords) * 3.28084),
             polygon: coords, osmId: w.id, osmTags: w.tags || {} };
  }).filter(Boolean);

  const mainCandidates = buildings.filter(b => b.label === 'Main Building');
  if (mainCandidates.length === 0) return null;

  const lngRef = parseFloat(lng), latRef = parseFloat(lat);
  mainCandidates.forEach(b => { b._dist = distM(lngRef, latRef, ...centroidOf(b.polygon)); });
  mainCandidates.sort((a, b) => a._dist - b._dist);
  const userHouse = mainCandidates[0];

  const houseCentroid = centroidOf(userHouse.polygon);
  const garages = buildings.filter(b => b.label !== 'Main Building');
  const nearbyGarages = garages.filter(g => distM(...houseCentroid, ...centroidOf(g.polygon)) <= 20);
  nearbyGarages.sort((a, b) => b.footprintSqFt - a.footprintSqFt);

  const result = [userHouse, ...nearbyGarages];
  return {
    footprintSqFt: result.reduce((s, b) => s + b.footprintSqFt, 0),
    perimeterFt:   result.reduce((s, b) => s + b.perimeterFt, 0),
    polygon: userHouse.polygon,
    buildings: result,
    source: 'osm',
  };
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function centroidOf(coords) {
  const n = coords.length - 1;
  let sumLon = 0, sumLat = 0;
  for (let i = 0; i < n; i++) { sumLon += coords[i][0]; sumLat += coords[i][1]; }
  return [sumLon / n, sumLat / n];
}

function distM(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function polygonAreaM2(coords) {
  if (!coords || coords.length < 3) return 0;
  const R = 6371000;
  let area = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    area += (lon2 - lon1) * (Math.PI / 180) *
            (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  return Math.abs(area) * R * R / 2;
}

function polygonPerimM(coords) {
  const R = 6371000;
  let d = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lon1, lat1] = coords[i];
    const [lon2, lat2] = coords[i + 1];
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return d;
}
