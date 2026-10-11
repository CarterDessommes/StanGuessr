# StanGuessr

A Stanford location guessing game inspired by GeoGuessr, made by Carter, Eric,
Tina, and Andrea for CS146J.

Play at **https://stanguessr.carterdessommes.workers.dev**.

## Cloudflare hosting

The frontend is served as Workers static assets. `worker/index.mjs` implements
the same `/api/*` endpoints as the original Express app, with persistent users
and scores in Cloudflare D1. The frontend and API share one origin.

Use the Workers **Free** plan. No paid subscription or custom domain is required.
Google Maps and Street View are billed separately by Google; check that account's
free usage allowance and quotas before promoting the game.

### Local development

1. Install Node.js 22 or later, then run `npm ci`.
2. Copy `.dev.vars.example` to `.dev.vars` and set `GOOGLE_MAPS_API_KEY`.
3. Run `npm run db:migrate:local`.
4. Run `npm run dev` and open `http://localhost:8787`.
5. With the local server running on port 8787, run `npm test` in another terminal.

Tests use only the local D1 emulator and create local test users/scores. They do
not write to the production database. `.dev.vars` and `.wrangler` are ignored.

### First deployment

1. Run `npx wrangler login` to authorize your Cloudflare account.
2. Run `npx wrangler d1 create stanguessr` and put its `database_id` in
   `wrangler.jsonc` (the checked-in ID belongs to the deployed game).
3. Run `npm run db:migrate:remote`.
4. Run `npx wrangler secret put GOOGLE_MAPS_API_KEY` and provide the browser Maps key.
5. Run `npm run deploy`. Wrangler prints the public `workers.dev` URL.
6. In Google Cloud, restrict the browser key to that exact website referrer
   (including `https://` and `/*`) and the Maps JavaScript API. Keep any existing
   needed referrers. Check Maps/Street View quotas and billing separately.
7. Verify `/api/health`, start a game, and check the map and Street View.

The browser necessarily receives the Maps key; website and API restrictions are
what prevent use on unrelated sites. Never commit account tokens or `.dev.vars`.

### Updating

Run `npm ci`, apply any new remote migrations with `npm run db:migrate:remote`,
then run `npm run deploy`. GitHub pushes alone do not deploy unless a Cloudflare
build integration is separately configured. `npm run deploy -- --dry-run`
validates the bundle without publishing it.

### Existing scores

Local SQLite files are not automatically imported or published. Back up the old
production database if it is still accessible, check its users/scores, then
import explicitly into D1. Do not import development test data by default.
The initial D1 schema enforces case-insensitive unique usernames, so resolve
duplicate names before importing old data.

### Behavior and limitations

The existing username-only login and client-submitted scores are preserved.
This is a casual game, not a password-protected account or verified competition.
API queries are bounded and indexed to keep D1 reads small. Free-plan limits may
temporarily make API/database operations unavailable if exceeded.

### Legacy Node server

The original Express/SQLite implementation remains in `backend/`. Install its
dependencies with `npm install --prefix backend`, configure `backend/.env`, and
run `npm run start:legacy` to use it at `http://localhost:3001`.
