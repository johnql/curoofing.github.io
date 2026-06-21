// Building footprint lookup for the roofing estimator.
//
// Queries the Overpass API (OpenStreetMap) for ALL building polygons at the
// given coordinates (house + garage + outbuildings).
// The GTA OSM data includes building outlines sourced from Microsoft's Canadian
// Building Footprints dataset (CC-BY-4.0).
//
// Returns:
//   footprintSqFt  — total combined area of all buildings
//   perimeterFt    — total combined perimeter of all buildings
//   polygon        — main building polygon [[lon,lat],...] for map display
//   buildings      — array of individual buildings with label/footprintSqFt/perimeterFt/polygon
//   source         — 'msft-osm' | 'not-found' | 'error' | etc.
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
    // out geom qt returns coordinates inline — no node expansion pass needed
    // 30m radius is sufficient for GTA lots (houses + attached/detached garages)
    const q = `[out:json][timeout:8];way[building](around:30,${lat},${lng});out geom qt;`;
    const OVERPASS_ENDPOINTS = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    ];

    let r;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        r = await fetch(`${endpoint}?data=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(9000) });
        if (r.ok) break;
      } catch (_) { /* try next */ }
    }
    if (!r || !r.ok) throw new Error('All Overpass endpoints failed');

    const data = await r.json();
    const elements = data.elements || [];

    const ways = elements.filter(e => e.type === 'way' && Array.isArray(e.geometry) && e.geometry.length >= 4);
    if (ways.length === 0) {
      return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'not-found' });
    }

    // Build individual building records
    const GARAGE_TAGS = /^(garage|carport|shed|outbuilding|hut|barn|storage_tank|storage|farm_auxiliary)$/;

    const buildings = ways.map(w => {
      // geometry from out geom: [{lat, lon}, ...] — convert to [lon, lat] pairs
      let coords = w.geometry.map(g => [g.lon, g.lat]);
      if (coords.length < 3) return null;

      // Ensure ring is closed
      const first = coords[0], last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first);

      const areaSqFt = Math.round(polygonAreaM2(coords) * 10.7639);
      const perimFt  = Math.round(polygonPerimM(coords)  * 3.28084);
      const tags     = w.tags || {};
      const tag      = tags.building || 'yes';
      const label    = GARAGE_TAGS.test(tag) ? 'Garage / Outbuilding' : 'Main Building';

      return { label, footprintSqFt: areaSqFt, perimeterFt: perimFt, polygon: coords, osmId: w.id, osmTags: tags };
    }).filter(Boolean);

    if (buildings.length === 0) {
      return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'bad-polygon' });
    }

    // Filter to only the user's property:
    //   1. Find the non-garage building whose centroid is closest to the geocoded point → user's house
    //   2. Include garages within 20m of that building's centroid → user's detached garage
    //   3. Discard all other buildings (neighbours grabbed by the radius)
    const lngRef = parseFloat(lng), latRef = parseFloat(lat);

    const mainCandidates = buildings.filter(b => b.label === 'Main Building');
    const garages        = buildings.filter(b => b.label !== 'Main Building');

    if (mainCandidates.length === 0) {
      return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'not-found' });
    }

    // Pick the house whose centroid is nearest the geocoded coordinate
    mainCandidates.forEach(b => { b._dist = distM(lngRef, latRef, ...centroidOf(b.polygon)); });
    mainCandidates.sort((a, b) => a._dist - b._dist);
    const userHouse = mainCandidates[0];

    // Attach garages that are within 20m of the house centroid
    const houseCentroid = centroidOf(userHouse.polygon);
    const nearbyGarages = garages.filter(g => distM(...houseCentroid, ...centroidOf(g.polygon)) <= 20);

    // Build final list: house first, then its garages sorted by size desc
    nearbyGarages.sort((a, b) => b.footprintSqFt - a.footprintSqFt);
    const result = [userHouse, ...nearbyGarages];

    const footprintSqFt = result.reduce((s, b) => s + b.footprintSqFt, 0);
    const perimeterFt   = result.reduce((s, b) => s + b.perimeterFt,   0);

    return res.status(200).json({
      footprintSqFt,
      perimeterFt,
      polygon:   userHouse.polygon,
      buildings: result,
      source: 'msft-osm',
    });

  } catch (e) {
    return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'error' });
  }
};

// ── Polygon centroid [lon, lat] ───────────────────────────────────────────────
function centroidOf(coords) {
  const n = coords.length - 1; // closed ring — skip duplicate last point
  let sumLon = 0, sumLat = 0;
  for (let i = 0; i < n; i++) { sumLon += coords[i][0]; sumLat += coords[i][1]; }
  return [sumLon / n, sumLat / n];
}

// ── Haversine point-to-point distance in metres ───────────────────────────────
function distM(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Spherical excess formula — polygon area in square metres ──────────────────
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

// ── Haversine — polygon perimeter in metres ───────────────────────────────────
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
