// AMEWRIN backend — minimal API matching what index.html already expects.
// Endpoints: /api/register /api/login /api/logout /api/assessments /api/facilities

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-deploying';
// CORS_ORIGIN: set to your frontend's URL in production (e.g. https://yourname.github.io)
// or leave as "*" while testing.
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// ---------- Database ----------
const db = new Database(path.join(__dirname, 'amewrin.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    phone TEXT UNIQUE NOT NULL,
    role TEXT,
    facility TEXT,
    pin_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    diagnosis TEXT,
    diagnosis_confidence REAL,
    referral_probability REAL,
    vitals TEXT,
    symptoms TEXT,
    facility_referred_to TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS facilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    town TEXT,
    lga TEXT,
    tier TEXT,
    lat REAL,
    lng REAL,
    address TEXT,
    phone TEXT,
    added_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// ---------- Helpers ----------
function signToken(account) {
  return jwt.sign({ id: account.id, phone: account.phone }, JWT_SECRET, { expiresIn: '90d' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.accountId = payload.id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired — please sign in again.' });
  }
}

function publicAccount(row) {
  return { id: row.id, name: row.name, phone: row.phone, role: row.role, facility: row.facility };
}

// ---------- Auth ----------
app.post('/api/register', (req, res) => {
  const { name, phone, role, facility, pin } = req.body || {};
  if (!phone || !pin) return res.status(400).json({ error: 'Phone number and PIN are required.' });
  if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4-6 digits.' });

  const existing = db.prepare('SELECT id FROM accounts WHERE phone = ?').get(phone);
  if (existing) return res.status(409).json({ error: 'An account with this phone number already exists.' });

  const pinHash = bcrypt.hashSync(pin, 10);
  const info = db.prepare(
    'INSERT INTO accounts (name, phone, role, facility, pin_hash) VALUES (?, ?, ?, ?, ?)'
  ).run(name || null, phone, role || null, facility || null, pinHash);

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(info.lastInsertRowid);
  res.json({ token: signToken(account), account: publicAccount(account) });
});

app.post('/api/login', (req, res) => {
  const { phone, pin } = req.body || {};
  if (!phone || !pin) return res.status(400).json({ error: 'Enter your phone number and PIN.' });

  const account = db.prepare('SELECT * FROM accounts WHERE phone = ?').get(phone);
  if (!account || !bcrypt.compareSync(pin, account.pin_hash)) {
    return res.status(401).json({ error: 'Phone number or PIN is incorrect.' });
  }
  res.json({ token: signToken(account), account: publicAccount(account) });
});

app.post('/api/logout', (req, res) => {
  // JWTs are stateless here — nothing to invalidate server-side.
  res.json({ ok: true });
});

// ---------- Assessments (per-account history) ----------
app.get('/api/assessments', authMiddleware, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM assessments WHERE account_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.accountId);
  const assessments = rows.map(r => ({
    ...r,
    vitals: r.vitals ? JSON.parse(r.vitals) : null,
    symptoms: r.symptoms ? JSON.parse(r.symptoms) : [],
  }));
  res.json({ assessments });
});

app.post('/api/assessments', authMiddleware, (req, res) => {
  const { diagnosis, diagnosis_confidence, referral_probability, vitals, symptoms, facility_referred_to } = req.body || {};
  db.prepare(`
    INSERT INTO assessments (account_id, diagnosis, diagnosis_confidence, referral_probability, vitals, symptoms, facility_referred_to)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.accountId,
    diagnosis || null,
    diagnosis_confidence ?? null,
    referral_probability ?? null,
    JSON.stringify(vitals || {}),
    JSON.stringify(symptoms || []),
    facility_referred_to || null
  );
  res.json({ ok: true });
});

// ---------- Shared facility directory ----------
app.get('/api/facilities', (req, res) => {
  const facilities = db.prepare('SELECT * FROM facilities ORDER BY created_at DESC').all();
  res.json({ facilities });
});

app.post('/api/facilities', authMiddleware, (req, res) => {
  const { name, town, lga, tier, lat, lng, address, phone } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Facility name is required.' });
  db.prepare(`
    INSERT INTO facilities (name, town, lga, tier, lat, lng, address, phone, added_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, town || '', lga || '', tier || 'custom', lat ?? null, lng ?? null, address || '', phone || '', req.accountId);
  res.json({ ok: true });
});

app.get('/', (req, res) => res.send('AMEWRIN backend is running.'));

app.listen(PORT, () => console.log(`AMEWRIN backend listening on port ${PORT}`));
