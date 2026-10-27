// Bootstraps a usable app: one owner account (from .env, or a printed
// generated password) plus, only if the DB is completely empty, two demo
// sites/floors with a small grid of desks so the app isn't a blank page on
// first run. Safe to re-run — it only creates what's missing.
import 'dotenv/config';
import { randomUUID, randomBytes } from 'node:crypto';
import { db } from './db.js';
import { hashPassword } from './auth/provider.js';

async function main() {
  await seedOwner();
  seedDemoDataIfEmpty();
  console.log('Seed complete.');
}

async function seedOwner() {
  const email = (process.env.SEED_OWNER_EMAIL || 'owner@example.com').toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    console.log(`Owner account already exists for ${email} — skipping.`);
    return;
  }
  const password = process.env.SEED_OWNER_PASSWORD || randomBytes(9).toString('base64url');
  const name = process.env.SEED_OWNER_NAME || 'Site Owner';
  const passwordHash = await hashPassword(password);
  db.prepare('INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    email,
    passwordHash,
    name,
    'owner'
  );
  console.log('Created owner account:');
  console.log(`  email:    ${email}`);
  if (!process.env.SEED_OWNER_PASSWORD) {
    console.log(`  password: ${password}  (generated — save this, it will not be shown again)`);
  } else {
    console.log('  password: (from SEED_OWNER_PASSWORD in .env)');
  }
}

function seedDemoDataIfEmpty() {
  const siteCount = db.prepare('SELECT COUNT(*) AS n FROM sites').get().n;
  if (siteCount > 0) {
    console.log('Sites already exist — skipping demo data.');
    return;
  }

  const departments = ['Engineering', 'Design', 'Sales', 'People Ops'];
  const insertPerson = db.prepare('INSERT INTO people (id, name, department, email) VALUES (?, ?, ?, ?)');
  const firstNames = ['Ava', 'Noah', 'Mia', 'Leo', 'Zoe', 'Kai', 'Ivy', 'Sam', 'Nina', 'Omar', 'Lily', 'Theo'];
  const lastNames = ['Chen', 'Patel', 'Garcia', 'Kim', 'Rossi', 'Novak', 'Diallo', 'Reyes'];
  const people = [];
  let n = 0;
  for (const first of firstNames) {
    for (const last of lastNames) {
      if (Math.random() > 0.35) continue;
      n += 1;
      const id = randomUUID();
      const dept = departments[n % departments.length];
      const email = `${first}.${last}@example.com`.toLowerCase();
      insertPerson.run(id, `${first} ${last}`, dept, email);
      people.push({ id, dept });
      if (n >= 30) break;
    }
    if (n >= 30) break;
  }

  const insertSite = db.prepare('INSERT INTO sites (id, name) VALUES (?, ?)');
  const insertFloor = db.prepare('INSERT INTO floors (id, site_id, name) VALUES (?, ?, ?)');
  const insertDesk = db.prepare(`
    INSERT INTO desks (id, floor_id, x, y, width, height, label, department, desk_type, assigned_person_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'standard', ?, ?)
  `);

  const sites = [
    { name: 'Harbor House', floor: 'Floor 1' },
    { name: 'Riverside Annex', floor: 'Floor 1' },
  ];

  let personIndex = 0;
  for (const siteDef of sites) {
    const siteId = randomUUID();
    insertSite.run(siteId, siteDef.name);
    const floorId = randomUUID();
    insertFloor.run(floorId, siteId, siteDef.floor);

    const cols = 8;
    const rows = 6;
    const deskW = 70;
    const deskH = 44;
    const gapX = 110;
    const gapY = 90;
    const originX = 80;
    const originY = 80;
    let deskNum = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.75) continue; // leave some gaps for walkways
        deskNum += 1;
        const person = Math.random() > 0.3 ? people[personIndex % people.length] : null;
        if (person) personIndex += 1;
        insertDesk.run(
          randomUUID(),
          floorId,
          originX + c * gapX,
          originY + r * gapY,
          deskW,
          deskH,
          `${siteDef.name === 'Harbor House' ? 'HH' : 'RA'}-${String(deskNum).padStart(3, '0')}`,
          person ? person.dept : departments[deskNum % departments.length],
          person ? person.id : null,
          'active'
        );
      }
    }
    console.log(`Seeded site "${siteDef.name}" / "${siteDef.floor}" with ${deskNum} desks.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
