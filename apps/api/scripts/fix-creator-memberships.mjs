/**
 * Migration — ensure every group has a Membership record for its owner.
 *
 * The backend create() correctly inserts this on new groups, but any group
 * created before the membership logic was added (or inserted directly via
 * MongoDB) may be missing it.
 *
 * Safe to run multiple times — skips groups that already have the record.
 *
 * Usage:
 *   node scripts/fix-creator-memberships.mjs
 */

import { MongoClient, ObjectId } from 'mongodb';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env ─────────────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, '../.env');
const envLines = readFileSync(envPath, 'utf8').split('\n');
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('MONGODB_URI not set'); process.exit(1); }

const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db();
  const groups      = db.collection('groups');
  const memberships = db.collection('memberships');

  // Find all non-deleted groups
  const allGroups = await groups.find({ deletedAt: null }).toArray();
  console.log(`Found ${allGroups.length} active group(s).`);

  let fixed   = 0;
  let already = 0;

  for (const group of allGroups) {
    const ownerId = group.ownerId;

    // Check if a membership already exists for this owner+group pair
    const exists = await memberships.findOne({
      userId:  ownerId,
      groupId: group._id,
    });

    if (exists) {
      already++;
      continue;
    }

    const now = new Date();
    await memberships.insertOne({
      userId:    ownerId,
      groupId:   group._id,
      createdAt: now,
      updatedAt: now,
    });

    // Try to resolve the owner email for a helpful log line
    const users = db.collection('users');
    const owner = await users.findOne({ _id: ownerId }, { projection: { email: 1, name: 1 } });
    const ownerLabel = owner ? `${owner.name ?? ''} <${owner.email}>` : ownerId.toString();

    console.log(`  FIXED  "${group.name}"  — added membership for ${ownerLabel}`);
    fixed++;
  }

  console.log(`\nDone. ${fixed} fixed, ${already} already correct.`);
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await client.close();
}
