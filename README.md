# AMEWRIN backend

Phone-number accounts + assessment storage for the AMEWRIN webapp.
Node.js + Express + SQLite (file-based, no separate database service needed).

## What this does
- `POST /api/register` — create an account with phone number + PIN (4+ digits)
- `POST /api/login` — log in, sets a secure httpOnly session cookie
- `POST /api/logout`
- `GET /api/me` — current logged-in user
- `POST /api/assessments` — save a completed assessment against the logged-in account
- `GET /api/assessments` — list this account's saved assessments (most recent first)
- `DELETE /api/assessments/:id`

No SMS OTP verification is included — phone number is just used as the login ID,
like a username. If you want real OTP verification (a text message with a code
before the account is created), that requires a paid SMS gateway with its own
API key. Termii (https://termii.com) and Africa's Talking both support Nigerian
numbers — ask me and I'll wire one in once you have an account/API key.

## 1. Run it locally first (optional but recommended)
```bash
npm install
npm start
```
It starts on `http://localhost:3000`. Test it:
```bash
curl http://localhost:3000/api/health
```

## 2. Deploy for free — Render.com (recommended, simplest)
1. Push this `backend/` folder to a GitHub repo (can be a new one just for this).
2. Go to https://render.com → New → Web Service → connect the repo.
3. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. Add environment variables (Render dashboard → Environment):
   - `SESSION_SECRET` — any long random string (e.g. generate one at https://randomkeygen.com)
   - `ALLOWED_ORIGINS` — your Netlify site URL, e.g. `https://amewrin-absu.netlify.app`
   - `NODE_ENV` — `production`
5. Deploy. Render gives you a URL like `https://amewrin-backend.onrender.com`.

**Note:** Render's free tier spins the server down after inactivity — the first
request after a while takes ~30-50 seconds to wake up. Fine for a student
project/demo; upgrade to a paid instance if that's a problem in real use.

**Data persistence note:** Render's free tier filesystem is ephemeral — the
SQLite file can be wiped on redeploy/restart. For a class demo this is usually
fine. For real production use, add a paid persistent disk on Render (Settings →
Disks) mounted at `/opt/render/project/src`, or migrate to a hosted Postgres
(ask me and I'll convert the schema).

## 3. Alternative — Railway.app
Same idea: connect the repo, it auto-detects Node, add the same environment
variables under Variables, deploy. Railway's free trial has usage credits
rather than a permanent free tier.

## 4. Point the webapp at your backend
Once deployed, open the webapp's HTML file, find this line near the top of the
`<script>` block:
```js
const API_BASE_URL = ''; // <-- set this to your deployed backend URL
```
Set it to your Render/Railway URL, e.g.:
```js
const API_BASE_URL = 'https://amewrin-backend.onrender.com';
```
Save, and re-upload/re-drag the file to Netlify (or wherever you're hosting
the frontend).
