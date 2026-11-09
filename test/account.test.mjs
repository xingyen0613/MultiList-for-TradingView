import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildAuthUrl,
  codeChallenge,
  isSignInAvailable,
  loadAccount,
  parseRedirect,
  randomString,
  signIn,
  signOut,
  SignInCancelled,
} from '../extension/lib/account.js';

function fakeArea(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(key) {
      return key in data ? { [key]: structuredClone(data[key]) } : {};
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    },
    async remove(key) {
      delete data[key];
    },
  };
}

const REDIRECT = 'https://abc.chromiumapp.org/';

test('the PKCE challenge matches the RFC 7636 example', async () => {
  assert.equal(
    await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('a random string is 43 url-safe characters and differs each time', () => {
  const a = randomString();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, randomString());
});

test('the auth url carries every parameter', () => {
  const url = new URL(buildAuthUrl({ authUrl: 'https://g.test/auth', clientId: 'cid', redirectUri: REDIRECT, challenge: 'ch', state: 'st' }));
  assert.equal(url.origin + url.pathname, 'https://g.test/auth');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: 'cid',
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: 'openid email',
    code_challenge: 'ch',
    code_challenge_method: 'S256',
    state: 'st',
    prompt: 'select_account',
  });
});

test('parseRedirect returns the code and rejects bad answers', () => {
  assert.equal(parseRedirect(`${REDIRECT}?code=abc&state=s1`, 's1'), 'abc');
  assert.throws(() => parseRedirect(`${REDIRECT}?code=abc&state=other`, 's1'), /state/);
  assert.throws(() => parseRedirect(`${REDIRECT}?code=abc`, 's1'), /state/);
  assert.throws(() => parseRedirect(`${REDIRECT}?state=s1`, 's1'), /no code/);
  assert.throws(() => parseRedirect(`${REDIRECT}?error=server_error&state=s1`, 's1'), /server_error/);
  assert.throws(() => parseRedirect(`${REDIRECT}?error=access_denied&state=s1`, 's1'), SignInCancelled);
});

test('sign-in is available only with both a server and a client id', () => {
  assert.equal(isSignInAvailable('', ''), false);
  assert.equal(isSignInAvailable('http://s', ''), false);
  assert.equal(isSignInAvailable('', 'cid'), false);
  assert.equal(isSignInAvailable('http://s', 'cid'), true);
});

function signInDeps({ launch, fetchFn } = {}) {
  const storage = { sync: fakeArea({ firstSeenAt: 1700000000000 }), local: fakeArea() };
  const calls = [];
  return {
    storage,
    calls,
    deps: {
      storage,
      serverUrl: 'http://s',
      clientId: 'cid',
      authUrl: 'https://g.test/auth',
      identity: {
        getRedirectURL: () => REDIRECT,
        launchWebAuthFlow: async ({ url }) => {
          calls.push(url);
          return launch(new URL(url).searchParams);
        },
      },
      fetchFn: fetchFn ?? (async (url, init) => {
        calls.push({ url, init });
        return { ok: true, json: async () => ({ token: 't1', email: 'a@b.c', accountId: 'acc1' }) };
      }),
    },
  };
}

test('signIn posts the code, verifier and first use date, then stores the session', async () => {
  const { deps, storage, calls } = signInDeps({ launch: (p) => `${REDIRECT}?code=c1&state=${p.get('state')}` });
  const account = await signIn(deps);
  assert.deepEqual(account, { email: 'a@b.c', token: 't1', accountId: 'acc1' });
  assert.deepEqual(storage.local.data.account, account);
  const { url, init } = calls[1];
  assert.equal(url, 'http://s/v1/auth/google');
  const body = JSON.parse(init.body);
  assert.deepEqual(Object.keys(body).sort(), ['code', 'codeVerifier', 'firstSeenAt', 'redirectUri']);
  assert.equal(body.firstSeenAt, 1700000000000);
  assert.equal(await codeChallenge(body.codeVerifier), new URL(calls[0]).searchParams.get('code_challenge'));
});

test('a new session clears the expired notice, a failed sign-in keeps it', async () => {
  const good = signInDeps({ launch: (p) => `${REDIRECT}?code=c1&state=${p.get('state')}` });
  good.storage.local.data.signInExpired = true;
  await signIn(good.deps);
  assert.equal(good.storage.local.data.signInExpired, undefined);

  const bad = signInDeps({ launch: () => `${REDIRECT}?code=c1&state=wrong` });
  bad.storage.local.data.signInExpired = true;
  await assert.rejects(signIn(bad.deps), /state/);
  assert.equal(bad.storage.local.data.signInExpired, true);
});

test('signIn stores nothing when the state does not match', async () => {
  const { deps, storage } = signInDeps({ launch: () => `${REDIRECT}?code=c1&state=wrong` });
  await assert.rejects(signIn(deps), /state/);
  assert.equal(storage.local.data.account, undefined);
});

test('a closed window is a cancel, other flow errors are not', async () => {
  const closed = signInDeps({ launch: () => Promise.reject(new Error('The user did not approve access.')) });
  await assert.rejects(signIn(closed.deps), SignInCancelled);
  const broken = signInDeps({ launch: () => Promise.reject(new Error('Authorization page could not be loaded.')) });
  await assert.rejects(signIn(broken.deps), (e) => !(e instanceof SignInCancelled));
});

test('signIn fails and stores nothing when the server refuses', async () => {
  const { deps, storage } = signInDeps({
    launch: (p) => `${REDIRECT}?code=c1&state=${p.get('state')}`,
    fetchFn: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(signIn(deps), /401/);
  assert.equal(storage.local.data.account, undefined);
});

test('signOut calls logout with the token and always clears the account', async () => {
  const storage = { local: fakeArea({ account: { email: 'a@b.c', token: 't1', accountId: 'x' } }) };
  const calls = [];
  await signOut({ storage, serverUrl: 'http://s', fetchFn: async (url, init) => (calls.push({ url, init }), { ok: true }) });
  assert.equal(calls[0].url, 'http://s/v1/auth/logout');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer t1');
  assert.equal(calls[0].init.body, '{}');
  assert.equal(await loadAccount(storage), null);
});

test('signOut clears the account even when the server fails', async () => {
  for (const fetchFn of [async () => ({ ok: false, status: 401 }), async () => { throw new Error('offline'); }]) {
    const storage = { local: fakeArea({ account: { email: 'a@b.c', token: 't1', accountId: 'x' } }) };
    await signOut({ storage, serverUrl: 'http://s', fetchFn });
    assert.equal(await loadAccount(storage), null);
  }
});
