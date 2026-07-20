# AMEWRIN backend

A minimal Express + SQLite API that gives the AMEWRIN frontend real accounts,
saved assessment history, and a shared facility directory. It implements
exactly the endpoints `index.html` already calls, so no frontend changes are
needed — you only paste in a URL at the end.

## What's inside
- `server.js` — the whole API (register/login, assessments, facilities)
- SQLite database file (`amewrin.db`), created automatically on first run
- JWT-based auth (phone + PIN, matching the app's sign-in modal)

## Node version
This project is pinned to **Node 20** via `package.json`'s `engines` field and a
`.node-version` file. Don't remove these — `better-sqlite3`'s native C++ addon
fails to compile on newer Node versions (e.g. 26) because their V8 headers have
dropped APIs it still uses. Render, Fly, and Railway all read one of these
files to pick the build image.

## 1. Run it locally first (optional but recommended)
```bash
cd amewrin-backend
npm install
JWT_SECRET=some-long-random-string npm start
```
It starts on `http://localhost:3000`. Test it:
```bash
curl http://localhost:3000/
```

## 2. Deploy it somewhere it'll stay up
Any Node host works. Two easy, reliable options:

### Option A — Render (recommended, generous free tier)
1. Push this `amewrin-backend` folder to a GitHub repo (its own repo, or a subfolder).
2. On [render.com](https://render.com) → **New → Web Service** → connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add environment variables:
   - `JWT_SECRET` → any long random string
   - `CORS_ORIGIN` → the URL where your frontend is hosted (e.g. `https://yourname.github.io`), or `*` while testing
5. Deploy. Render gives you a URL like `https://amewrin-backend.onrender.com`.

**Note on free tier:** Render's free web services sleep after inactivity and take ~30–60s to wake on the next request — the first assessment save after a quiet period may feel slow. Fine for a pilot; upgrade to a paid instance for always-on use in the field.

### Option B — Fly.io
```bash
fly launch      # accept defaults, don't add a managed Postgres — we use SQLite
fly secrets set JWT_SECRET=some-long-random-string CORS_ORIGIN=https://your-frontend-url
fly deploy
```
Fly gives you a URL like `https://amewrin-backend.fly.dev`.

**Important for SQLite on Fly:** attach a persistent volume, or the database resets on every redeploy:
```bash
fly volumes create amewrin_data --size 1
```
and in `fly.toml` add a `[mounts]` section pointing at `/data`, then change the SQLite path in `server.js` to `/data/amewrin.db`.

### If you go back to Railway
Same steps as Render: set `JWT_SECRET` and `CORS_ORIGIN` as variables, build with `npm install`, start with `npm start`. Just double-check the service's generated **public domain** is enabled (Settings → Networking → Generate Domain) — a very common cause of "it deployed but I can't reach it."

## 3. Point the frontend at it
In `index.html`, find:
```js
const API_BASE = "";
```
and set it to your deployed URL, no trailing slash:
```js
const API_BASE = "https://amewrin-backend.onrender.com";
```
Sign-up, sign-in, saved history, and the shared facility directory will start working immediately — no other frontend changes required.

## Notes
- PINs are hashed with bcrypt before storage — never stored in plain text.
- This is a lightweight pilot backend (SQLite, single instance). For multi-facility production use at scale, swap SQLite for a managed Postgres (e.g. Render's or Supabase's) and keep the same API shape.
