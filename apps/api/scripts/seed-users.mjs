/**
 * Seed Script — inserts test users into MongoDB
 *
 * Usage:
 *   node scripts/seed-users.mjs
 *
 * Each user gets a bcrypt-hashed password. The script skips any email
 * that already exists, so it is safe to run multiple times.
 */

import { MongoClient } from 'mongodb';
import bcrypt from 'bcrypt';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Load .env manually (no dotenv dependency needed) ──────────────────────────
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

// ── Users to seed ─────────────────────────────────────────────────────────────
// Change names, emails, and passwords as needed.
// Password rules: min 8 chars, at least one letter + one digit.
const USERS = [
  { name: 'Alice Sharma',   email: 'alice@example.com',   password: 'Alice123' },
  { name: 'Bob Mehta',      email: 'bob@example.com',     password: 'Bobby456' },
  { name: 'Carol Singh',    email: 'carol@example.com',   password: 'Carol789' },
  { name: 'David Rao',      email: 'david@example.com',   password: 'David999' },
  { name: 'Eve Kapoor',     email: 'eve@example.com',     password: 'Evelyn11' },
];

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '11', 10);
const MONGODB_URI   = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not set in .env');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGODB_URI);

try {
  await client.connect();
  const db = client.db(); // uses the DB name from the URI
  const col = db.collection('users');

  let inserted = 0;
  let skipped  = 0;

  for (const u of USERS) {
    const email = u.email.toLowerCase().trim();
    const existing = await col.findOne({ email });

    if (existing) {
      console.log(`  SKIP  ${email}  (already exists)`);
      skipped++;
      continue;
    }

    const passwordHash = await bcrypt.hash(u.password, BCRYPT_ROUNDS);
    const now = new Date();

    await col.insertOne({
      email,
      name: u.name,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    console.log(`  ADD   ${email}  → ${u.name}`);
    inserted++;
  }

  console.log(`\nDone. ${inserted} inserted, ${skipped} skipped.`);
} catch (err) {
  console.error('Seed failed:', err.message);
  process.exit(1);
} finally {
  await client.close();
}
