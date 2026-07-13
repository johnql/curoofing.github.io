'use strict';
/**
 * Deletes the suspended Vercel Blob store and creates a fresh one.
 *
 * Prerequisites:
 *   Add VERCEL_TOKEN to .env.local — get one at vercel.com/account/tokens
 *   (Scope: Full Account, or at minimum: Read + Write on Blob Stores)
 *
 * What this script does:
 *   1. DELETE the old (suspended) store via Vercel REST API
 *   2. POST a new store
 *   3. Connect it to this Vercel project
 *   4. Pull the new BLOB_READ_WRITE_TOKEN from Vercel into .env.local
 *   5. Update BLOB_STORE_ID in .env.local
 *
 * After running, continue with:
 *   node scripts/tile-msft.js <GTA.geojson> ./msft-tiles-02
 *   node scripts/upload-tiles.js ./msft-tiles-02
 */

require('dotenv').config({ path: '.env.local' });
const fs         = require('fs');
const path       = require('path');
const { execSync } = require('child_process');
const os         = require('os');

// Hardcoded from .vercel/project.json — safe to commit
const TEAM_ID    = 'team_6esNFxJTLGmuapMAGYbBS1ae';
const PROJECT_ID = 'prj_HTBv7lAYMekJOyC3XJTkBlnKdVk2';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const OLD_STORE_ID = (process.env.BLOB_STORE_ID || '').replace(/"/g, '');
const NEW_STORE_NAME = 'curoofing-msft';

async function api(method, endpoint, body) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.vercel.com${endpoint}${sep}teamId=${TEAM_ID}`;
  const r = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${endpoint} → ${r.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function updateEnvLocal(key, value) {
  const envPath = path.resolve('.env.local');
  let content = fs.readFileSync(envPath, 'utf8');
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line  = `${key}="${value}"`;
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content += `\n${line}\n`;
  }
  fs.writeFileSync(envPath, content);
}

async function main() {
  if (!VERCEL_TOKEN) {
    console.error('VERCEL_TOKEN not set in .env.local');
    console.error('Get one at: https://vercel.com/account/tokens');
    console.error('Then add:   VERCEL_TOKEN=your-token-here');
    process.exit(1);
  }

  // 1. Delete old store (404 is fine — already gone)
  if (OLD_STORE_ID) {
    process.stdout.write(`Deleting old store ${OLD_STORE_ID}...`);
    try {
      await api('DELETE', `/v1/storage/stores/${OLD_STORE_ID}`);
      console.log(' done.');
    } catch (e) {
      if (e.message.includes('404') || e.message.toLowerCase().includes('not found')) {
        console.log(' already gone.');
      } else {
        throw e;
      }
    }
  } else {
    console.log('No BLOB_STORE_ID in .env.local — skipping delete step.');
  }

  // 2. Create new store
  process.stdout.write(`Creating new store "${NEW_STORE_NAME}"...`);
  const { store } = await api('POST', '/v1/storage/stores', {
    name: NEW_STORE_NAME,
    type: 'blob',
  });
  console.log(` done. New store ID: ${store.id}`);

  // 3. Connect store to project (makes BLOB_READ_WRITE_TOKEN appear in project env vars)
  process.stdout.write('Connecting store to Vercel project...');
  try {
    await api('POST', `/v1/projects/${PROJECT_ID}/storages`, {
      storeId: store.id,
      type: 'blob',
    });
    console.log(' done.');
  } catch (e) {
    // Some Vercel API versions use a different endpoint
    console.log(' (connection API call failed — trying alternate endpoint)');
    try {
      await api('POST', `/v1/storage/stores/${store.id}/connections`, {
        projectId: PROJECT_ID,
      });
      console.log('  Connected via alternate endpoint.');
    } catch (e2) {
      console.warn('\nWARNING: Could not auto-connect store to project.');
      console.warn('Go to vercel.com → Storage → ' + NEW_STORE_NAME + ' → Connect to Project → curoofing');
      console.warn('Then re-run this script with BLOB_STORE_ID=' + store.id + ' in .env.local to update the token.\n');
    }
  }

  // 4. Update BLOB_STORE_ID in .env.local immediately
  updateEnvLocal('BLOB_STORE_ID', store.id);
  console.log(`Updated BLOB_STORE_ID in .env.local → ${store.id}`);

  // 5. Pull new BLOB_READ_WRITE_TOKEN via Vercel CLI
  //    (The CLI decrypts env vars for local dev — safer than the REST API which returns encrypted values)
  console.log('\nPulling new BLOB_READ_WRITE_TOKEN via Vercel CLI...');
  const tmpFile = path.join(os.tmpdir(), '.vercel-env-blob-tmp');
  try {
    execSync(`vercel env pull "${tmpFile}" --yes`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VERCEL_TOKEN },
    });

    const pulled = fs.readFileSync(tmpFile, 'utf8');
    fs.unlinkSync(tmpFile);

    const match = pulled.match(/^BLOB_READ_WRITE_TOKEN=(.+)$/m);
    if (match) {
      const newToken = match[1].replace(/^"|"$/g, '');
      updateEnvLocal('BLOB_READ_WRITE_TOKEN', newToken);
      console.log('Updated BLOB_READ_WRITE_TOKEN in .env.local');
    } else {
      printManualTokenStep(store.id);
    }
  } catch (e) {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    console.warn('vercel env pull failed:', e.message);
    printManualTokenStep(store.id);
  }

  console.log('\n✓ Store recreated. Next steps:');
  console.log('  1. node scripts/tile-msft.js <GTA.geojson> ./msft-tiles-02');
  console.log('  2. node scripts/upload-tiles.js ./msft-tiles-02');
}

function printManualTokenStep(storeId) {
  console.log('\nAction needed — copy the new BLOB_READ_WRITE_TOKEN manually:');
  console.log(`  1. vercel.com → Storage → ${NEW_STORE_NAME} → .env.local tab`);
  console.log('  2. Copy the BLOB_READ_WRITE_TOKEN value');
  console.log('  3. Paste it into .env.local:');
  console.log(`     BLOB_STORE_ID="${storeId}"`);
  console.log('     BLOB_READ_WRITE_TOKEN="vercel_blob_rw_....."');
}

main().catch(e => { console.error('\nError:', e.message); process.exit(1); });
