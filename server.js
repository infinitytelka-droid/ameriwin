/**
 * AMEWRIN backend
 * - Phone-number + PIN accounts (no SMS OTP — see README for adding that)
 * - httpOnly cookie sessions (not browser localStorage)
 * - Stores submitted assessments per account, with history retrieval
 *
 * Run locally:  npm install && npm start
 * Deploy: see README.md (Render / Railway, both free tier)
 */
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const cookieSession = require('cookie-session');
const cors = require('cors');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-before-deploying';
// Comma-separated list of allowed origins (your Netlify site URL). Set this env var after deploying the frontend.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());

const app = express();
app.use(express.json());
app.use(cors({
  origin: ALLOWED_ORIGINS.includes('*') ? true : ALLOWED_ORIGINS,
  credentials: true,
}));
app.use(cookieSession({
  name: 'amewrin_session',
  secret: SESSION_SECRET,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  sameSite: 'none',
  secure: process.env.NODE_ENV === 'production',
}));

// ---- Database setup ----
const db = new Database(path.join(__dirname, 'amewrin.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    pin_hash TEXT NOT NULL,
    name TEXT,
    facility TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    patient_ref TEXT,
    inputs_json TEXT NOT NULL,
    diagnosis TEXT,
    confidence REAL,
    referral_prob REAL,
    facility_name TEXT,
    facility_phone TEXT,
    facility_address TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ---- Helpers ----
function normalizePhone(raw) {
  // Basic Nigerian-number-friendly normalization: strip spaces/dashes, keep leading +
  return String(raw || '').replace(/[^\d+]/g, '');
}
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}

// ---- Routes ----
app.get('/api/health', (req, res) => res.json({ ok: true }));

app.post('/api/register', (req, res) => {
  const { phone, pin, name, facility } = req.body || {};
  const cleanPhone = normalizePhone(phone);

  if (!cleanPhone || cleanPhone.length < 7) {
    return res.status(400).json({ error: 'Enter a valid phone number.' });
  }
  if (!pin || String(pin).length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 digits.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
  if (existing) {
    return res.status(409).json({ error: 'An account with this phone number already exists.' });
  }

  const pinHash = bcrypt.hashSync(String(pin), 10);
  const info = db.prepare(
    'INSERT INTO users (phone, pin_hash, name, facility) VALUES (?, ?, ?, ?)'
  ).run(cleanPhone, pinHash, name || null, facility || null);

  req.session.userId = info.lastInsertRowid;
  res.json({ ok: true, user: { id: info.lastInsertRowid, phone: cleanPhone, name, facility } });
});

app.post('/api/login', (req, res) => {
  const { phone, pin } = req.body || {};
  const cleanPhone = normalizePhone(phone);
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);

  if (!user || !bcrypt.compareSync(String(pin || ''), user.pin_hash)) {
    return res.status(401).json({ error: 'Incorrect phone number or PIN.' });
  }

  req.session.userId = user.id;
  res.json({ ok: true, user: { id: user.id, phone: user.phone, name: user.name, facility: user.facility } });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, phone, name, facility, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user });
});

// Save a completed assessment (called after a health worker runs the model in the webapp)
app.post('/api/assessments', requireAuth, (req, res) => {
  const {
    patientRef, inputs, diagnosis, confidence, referralProb,
    facilityName, facilityPhone, facilityAddress,
  } = req.body || {};

  if (!inputs || !diagnosis) {
    return res.status(400).json({ error: 'Missing assessment data.' });
  }

  const info = db.prepare(`
    INSERT INTO assessments
      (user_id, patient_ref, inputs_json, diagnosis, confidence, referral_prob, facility_name, facility_phone, facility_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.session.userId,
    patientRef || null,
    JSON.stringify(inputs),
    diagnosis,
    confidence ?? null,
    referralProb ?? null,
    facilityName || null,
    facilityPhone || null,
    facilityAddress || null
  );

  res.json({ ok: true, id: info.lastInsertRowid });
});

// List this account's saved assessments, most recent first
app.get('/api/assessments', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT id, patient_ref, inputs_json, diagnosis, confidence, referral_prob,
           facility_name, facility_phone, facility_address, created_at
    FROM assessments WHERE user_id = ? ORDER BY created_at DESC LIMIT 200
  `).all(req.session.userId);

  const out = rows.map(r => ({ ...r, inputs: JSON.parse(r.inputs_json), inputs_json: undefined }));
  res.json({ assessments: out });
});

app.delete('/api/assessments/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM assessments WHERE id = ? AND user_id = ?').run(req.params.id, req.session.userId);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`AMEWRIN backend listening on port ${PORT}`));
