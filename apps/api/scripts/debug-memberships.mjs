import { MongoClient } from 'mongodb';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db();

// Show all users
const users = await db.collection('users').find({}, { projection: { name:1, email:1 }}).toArray();
console.log('=== USERS ===');
users.forEach(u => console.log(`  ${u._id}  ${u.name}  <${u.email}>`));

// Show all groups
const groups = await db.collection('groups').find({ deletedAt: null }).toArray();
console.log('\n=== GROUPS ===');
groups.forEach(g => console.log(`  ${g._id}  "${g.name}"  ownerId=${g.ownerId}`));

// Show all memberships
const memberships = await db.collection('memberships').find({}).toArray();
console.log('\n=== MEMBERSHIPS ===');
memberships.forEach(m => console.log(`  groupId=${m.groupId}  userId=${m.userId}`));

// Cross-reference: for each group, show which members exist
console.log('\n=== MEMBERSHIP CHECK PER GROUP ===');
for (const g of groups) {
  const mems = memberships.filter(m => m.groupId.toString() === g._id.toString());
  const ownerIsMember = mems.some(m => m.userId.toString() === g.ownerId.toString());
  console.log(`  "${g.name}" (owner=${g.ownerId}) → ${mems.length} member(s), owner is member: ${ownerIsMember}`);
  mems.forEach(m => {
    const user = users.find(u => u._id.toString() === m.userId.toString());
    console.log(`    - ${m.userId}  ${user?.name ?? '(unknown)'} <${user?.email ?? '?'}>`);
  });
}

await client.close();
