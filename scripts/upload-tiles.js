'use strict';
/**
 * Uploads msft-tiles/ to Supabase Storage (public bucket, no auth needed for reads).
 *
 * Prerequisites:
 *   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local
 *
 * Usage:
 *   node scripts/tile-msft.js <GTA.geojson> ./msft-tiles-02
 *   node scripts/upload-tiles.js ./msft-tiles-02
 */

require('dotenv').config({ path: '.env.local' });
const fs   = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET       = 'msft-tiles';
const CONCURRENCY  = 10;

async function uploadFile(filename, tilesDir) {
  const data = fs.readFileSync(path.join(tilesDir, filename));
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${filename}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'apikey': SERVICE_KEY,
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    },
    body: data,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${filename}: ${r.status} ${await r.text()}`);
}

async function main() {
  const tilesDir = process.argv[2] || './msft-tiles';
  if (!fs.existsSync(tilesDir)) {
    console.error(`Tiles directory not found: ${tilesDir}`);
    console.error('Run scripts/tile-msft.js first.');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
    process.exit(1);
  }

  const files = fs.readdirSync(tilesDir).filter(f => f.endsWith('.json'));
  console.log(`Uploading ${files.length} tiles to Supabase Storage bucket "${BUCKET}"...`);

  let uploaded = 0;
  const errors = [];
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async f => {
      try { await uploadFile(f, tilesDir); }
      catch (e) { errors.push(e.message); }
    }));
    uploaded = Math.min(i + CONCURRENCY, files.length);
    process.stdout.write(`  ${uploaded}/${files.length}\r`);
  }

  console.log(`\nDone. ${uploaded} attempted, ${errors.length} errors.`);
  if (errors.length > 0) console.error('First errors:\n', errors.slice(0, 3).join('\n'));

  const baseUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
  console.log(`\nMSFT_TILES_BASE_URL = ${baseUrl}`);

  // Update MSFT_TILES_BASE_URL in .env.local
  const envPath = path.resolve('.env.local');
  let env = fs.readFileSync(envPath, 'utf8');
  env = env.replace(/^MSFT_TILES_BASE_URL=.*/m, `MSFT_TILES_BASE_URL=${baseUrl}`);
  fs.writeFileSync(envPath, env);
  console.log('Updated MSFT_TILES_BASE_URL in .env.local');
}

main().catch(e => { console.error(e); process.exit(1); });
