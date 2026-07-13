'use strict';
/**
 * Tiles Microsoft Canadian Building Footprints (Ontario.geojson → GTA.geojson)
 * into a 0.01° × 0.01° grid so get-property.js can fetch just the relevant
 * ~1 km cell instead of downloading the full 203 MB file per request.
 *
 * Usage:
 *   node scripts/tile-msft.js <path-to-GTA.geojson> <output-dir>
 *
 * Example:
 *   node scripts/tile-msft.js ./GTA.geojson ./msft-tiles
 *
 * Output: one JSON file per non-empty tile, e.g. msft-tiles/4382_-7958.json
 * Each file is a compact JSON array of coordinate rings:
 *   [ [[lon,lat],...], [[lon,lat],...], ... ]
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');

const TILE_SIZE = 0.02; // degrees — ~2.2 km lat × ~1.6 km lng at GTA latitudes (~1,258 tiles)

function tileKey(lat, lng) {
  return `${Math.floor(lat / TILE_SIZE)}_${Math.floor(lng / TILE_SIZE)}`;
}

function centroidOf(coords) {
  const n = coords.length - 1;
  let sumLon = 0, sumLat = 0;
  for (let i = 0; i < n; i++) { sumLon += coords[i][0]; sumLat += coords[i][1]; }
  return [sumLon / n, sumLat / n];
}

// Round coordinates to 5 decimal places (~1 m precision, plenty for roofing estimates)
function roundCoords(ring) {
  return ring.map(([lon, lat]) => [
    Math.round(lon * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);
}

async function main() {
  const [,, inputFile, outputDir] = process.argv;
  if (!inputFile || !outputDir) {
    console.error('Usage: node scripts/tile-msft.js <GTA.geojson> <output-dir>');
    process.exit(1);
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const tiles = new Map(); // tileKey → array of rings
  const firstCoordRe = /\[\[(-?\d+\.\d+),(\d+\.\d+)\]/;

  console.log(`Reading ${inputFile}...`);
  let lineCount = 0, featureCount = 0;

  await new Promise(resolve => {
    const rl = readline.createInterface({ input: fs.createReadStream(inputFile) });
    rl.on('line', line => {
      lineCount++;
      if (!line.includes('Feature')) return;

      const m = firstCoordRe.exec(line);
      if (!m) return;

      let feature;
      try {
        feature = JSON.parse(line.trim().replace(/^,/, '').replace(/,$/, ''));
      } catch (_) { return; }

      const ring = feature.geometry?.coordinates?.[0];
      if (!ring || ring.length < 4) return;

      const [cLon, cLat] = centroidOf(ring);
      const key = tileKey(cLat, cLon);

      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push(roundCoords(ring));
      featureCount++;

      if (featureCount % 100000 === 0) process.stdout.write(`  ${featureCount} buildings...\r`);
    });
    rl.on('close', resolve);
  });

  console.log(`\nIndexed ${featureCount} buildings into ${tiles.size} tiles. Writing...`);

  let written = 0;
  for (const [key, rings] of tiles) {
    const outPath = path.join(outputDir, `${key}.json`);
    fs.writeFileSync(outPath, JSON.stringify(rings));
    written++;
    if (written % 500 === 0) process.stdout.write(`  ${written}/${tiles.size} tiles...\r`);
  }

  console.log(`\nDone. ${tiles.size} tile files written to ${outputDir}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
