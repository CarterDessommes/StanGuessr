import { stanfordLocations } from './locations.mjs';

const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store' },
});
const fail = (message, status = 400) => json({ error: message }, status);
const positiveInt = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validLimit = (value) => positiveInt(value) && Number(value) <= 100;
const validScore = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 25000;

async function readBody(request) {
  const text = await request.text();
  if (text.length > 8192) throw new Error('BODY_TOO_LARGE');
  if (request.headers.get('content-type')?.includes('application/json')) {
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('INVALID_BODY');
    return body;
  }
  return Object.fromEntries(new URLSearchParams(text));
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  let match;

  if (method === 'GET' && path === '/api/health') {
    await env.DB.prepare('SELECT 1 FROM users LIMIT 1').all();
    return json({ status: 'ok', database: 'ok', mapsConfigured: Boolean(env.GOOGLE_MAPS_API_KEY) });
  }
  if (method === 'GET' && path === '/api/config/maps') {
    return env.GOOGLE_MAPS_API_KEY
      ? json({ apiKey: env.GOOGLE_MAPS_API_KEY })
      : fail('GOOGLE_MAPS_API_KEY is not configured', 503);
  }
  if (method === 'GET' && path === '/api/location/random') {
    const excluded = new Set((url.searchParams.get('exclude') || '').split(',').map(Number));
    const available = stanfordLocations.filter(({ id }) => !excluded.has(id));
    if (!available.length) return fail('No unused locations available', 409);
    return json(available[Math.floor(Math.random() * available.length)]);
  }
  if (method === 'GET' && (match = path.match(/^\/api\/leaderboard\/rank\/([^/]+)$/))) {
    const score = Number(match[1]);
    if (!validScore(score)) return fail('Score must be an integer between 0 and 25000');
    return json(await env.DB.prepare('SELECT COUNT(*) + 1 AS rank FROM games WHERE score > ?').bind(score).first());
  }
  if (method === 'GET' && (match = path.match(/^\/api\/leaderboard\/([^/]+)$/))) {
    if (!validLimit(match[1])) return fail('Limit must be an integer between 1 and 100');
    const { results } = await env.DB.prepare(`SELECT users.name, games.score FROM games
      INNER JOIN users ON games.userid = users.userid ORDER BY games.score DESC LIMIT ?`)
      .bind(Number(match[1])).all();
    return json(results);
  }
  if (method === 'GET' && (match = path.match(/^\/api\/users\/([^/]+)\/scores\/([^/]+)$/))) {
    if (!positiveInt(match[1]) || !validLimit(match[2])) return fail('Invalid user ID or limit');
    const { results } = await env.DB.prepare('SELECT score FROM games WHERE userid = ? ORDER BY score DESC LIMIT ?')
      .bind(Number(match[1]), Number(match[2])).all();
    return json(results);
  }
  if (method === 'POST' && ['/api/signup', '/api/login', '/api/users', '/api/end-game'].includes(path)) {
    // The browser and API share an origin; prevent cross-site form submissions.
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return fail('Origin not allowed', 403);
    let body;
    try { body = await readBody(request); }
    catch { return fail('Invalid or oversized request body'); }

    if (path === '/api/end-game') {
      const { score, userid } = body;
      if (!validScore(score) || !positiveInt(userid)) return fail('A valid score and user ID are required');
      // INSERT SELECT handles a nonexistent user without a foreign-key exception.
      const game = await env.DB.prepare(`INSERT INTO games (score, userid)
        SELECT ?, userid FROM users WHERE userid = ? RETURNING gameid, score, userid`)
        .bind(score, Number(userid)).first();
      return game ? json(game, 201) : fail('User not found', 404);
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) return fail('Name must be between 1 and 80 characters');
    if (path === '/api/login') {
      const user = await env.DB.prepare('SELECT userid, name FROM users WHERE LOWER(name) = LOWER(?)')
        .bind(name).first();
      return user ? json(user) : fail('Username not found', 401);
    }
    const user = await env.DB.prepare(`INSERT INTO users (name) VALUES (?)
      ON CONFLICT DO NOTHING RETURNING userid, name`).bind(name).first();
    return user ? json(user, 201) : fail('Name already taken', 409);
  }
  return fail('API route not found', 404);
}

export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await handleApi(request, env); }
    catch (error) {
      console.error('StanGuessr API failure:', error.message);
      return fail('Something went wrong. Please try again.', 500);
    }
  },
};
