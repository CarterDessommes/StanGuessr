import { test } from 'node:test';
import assert from 'node:assert/strict';

// Run against Wrangler's local D1 emulator only, never the production database.
const base = 'http://127.0.0.1:8787';
async function api(path, body) {
  const response = await fetch(base + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test('frontend assets and database health are served together', async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>StanGuessr<\/title>/);
  assert.equal((await api('/api/health')).data.database, 'ok');
  assert.equal((await fetch(base + '/media/stanguessr.png')).status, 200);
  assert.equal((await api('/api/not-found')).status, 404);
});

test('all locations can be drawn without repetition and exhaustion is explicit', async () => {
  const ids = [];
  for (let i = 0; i < 48; i++) {
    const { status, data } = await api('/api/location/random?exclude=' + ids.join(','));
    assert.equal(status, 200);
    assert.ok(!ids.includes(data.id));
    assert.equal(typeof data.lat, 'number');
    ids.push(data.id);
  }
  assert.equal((await api('/api/location/random?exclude=' + ids.join(','))).status, 409);
});

test('signup, case-insensitive login, score persistence, ranking and validation', async () => {
  const name = 'LocalTest-' + crypto.randomUUID();
  const form = await fetch(base + '/api/signup', {
    method: 'POST', body: new URLSearchParams({ name: ' ' + name + ' ' }),
  });
  assert.equal(form.status, 201);
  const user = await form.json();
  assert.equal(user.name, name);
  const duplicate = await api('/api/signup', { name: name.toLowerCase() });
  assert.equal(duplicate.status, 409);
  assert.deepEqual((await api('/api/login', { name: name.toUpperCase() })).data, user);
  assert.equal((await api('/api/login', { name: crypto.randomUUID() })).status, 401);
  for (const score of [0, 12500, 25000]) {
    const game = await api('/api/end-game', { userid: user.userid, score });
    assert.equal(game.status, 201);
    assert.equal(game.data.score, score);
  }
  assert.deepEqual((await api(`/api/users/${user.userid}/scores/3`)).data,
    [{ score: 25000 }, { score: 12500 }, { score: 0 }]);
  assert.equal((await api('/api/leaderboard/rank/25000')).data.rank, 1);
  assert.ok((await api('/api/leaderboard/100')).data.some(row => row.name === name));
  for (const score of [-1, 25001, 1.5, null, '100']) {
    assert.equal((await api('/api/end-game', { userid: user.userid, score })).status, 400);
  }
  assert.equal((await api('/api/end-game', { userid: 999999999, score: 100 })).status, 404);
  assert.equal((await api('/api/leaderboard/-1')).status, 400);
  assert.equal((await api('/api/signup', { name: { bad: true } })).status, 400);
  const bad = await fetch(base + '/api/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  });
  assert.equal(bad.status, 400);
  const crossOrigin = await fetch(base + '/api/signup', {
    method: 'POST', headers: { Origin: 'https://other.example' }, body: 'name=forbidden',
  });
  assert.equal(crossOrigin.status, 403);
});
