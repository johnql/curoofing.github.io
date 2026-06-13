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
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`;

    const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error('Overpass HTTP ' + r.status);

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
      const tag      = (w.tags && w.tags.building) || 'yes';
      const label    = GARAGE_TAGS.test(tag) ? 'Garage / Outbuilding' : 'Main Building';

      return { label, footprintSqFt: areaSqFt, perimeterFt: perimFt, polygon: coords };
    }).filter(Boolean);

    if (buildings.length === 0) {
      return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'bad-polygon' });
    }

    // Sort: largest main building first, then garages
    buildings.sort((a, b) => {
      const aGarage = a.label !== 'Main Building';
      const bGarage = b.label !== 'Main Building';
      if (aGarage !== bGarage) return aGarage ? 1 : -1;
      return b.footprintSqFt - a.footprintSqFt;
    });

    const footprintSqFt = buildings.reduce((s, b) => s + b.footprintSqFt, 0);
    const perimeterFt   = buildings.reduce((s, b) => s + b.perimeterFt,   0);

    return res.status(200).json({
      footprintSqFt,
      perimeterFt,
      polygon:   buildings[0].polygon,   // main/largest building for map overlay
      buildings,
      source: 'msft-osm',
    });

  } catch (e) {
    return res.status(200).json({ footprintSqFt: null, perimeterFt: null, polygon: null, buildings: [], source: 'error' });
  }
};

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
