// Optional Google sign-in. The session lives in chrome.storage.local, so each browser signs in
// on its own. The anonymous upload never reads it.

import { GOOGLE_AUTH_URL, GOOGLE_CLIENT_ID, SERVER_URL } from './config.js';
import { ensureFirstSeen } from './sharing.js';

const ACCOUNT_KEY = 'account';

// Thrown when the user closes the Google window or refuses access, so the screen can stay quiet.
export class SignInCancelled extends Error {
  constructor() {
    super('sign-in cancelled');
    this.name = 'SignInCancelled';
  }
}

export function isSignInAvailable(serverUrl = SERVER_URL, clientId = GOOGLE_CLIENT_ID) {
  return Boolean(serverUrl && clientId);
}

export function base64url(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 32 random bytes give a 43 character string.
export function randomString(random = crypto.getRandomValues.bind(crypto)) {
  return base64url(random(new Uint8Array(32)));
}

export async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function buildAuthUrl({ authUrl = GOOGLE_AUTH_URL, clientId, redirectUri, challenge, state }) {
  const url = new URL(authUrl);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

// Returns the authorization code, or throws when the redirect is not a good answer to our request.
export function parseRedirect(redirectUrl, expectedState) {
  const params = new URL(redirectUrl).searchParams;
  if (params.get('state') !== expectedState) throw new Error('state mismatch');
  const error = params.get('error');
  if (error === 'access_denied') throw new SignInCancelled();
  if (error) throw new Error(`google error: ${error}`);
  const code = params.get('code');
  if (!code) throw new Error('no code in redirect');
  return code;
}

// Chrome rejects with this text when the user closes the window or declines.
const CANCEL_PATTERN = /did not approve|cancel/i;

export async function signIn({
  identity = chrome.identity,
  storage = chrome.storage,
  fetchFn = fetch,
  serverUrl = SERVER_URL,
  clientId = GOOGLE_CLIENT_ID,
  authUrl = GOOGLE_AUTH_URL,
} = {}) {
  if (!isSignInAvailable(serverUrl, clientId)) throw new Error('sign-in is off');
  const codeVerifier = randomString();
  const state = randomString();
  const redirectUri = identity.getRedirectURL();
  const url = buildAuthUrl({ authUrl, clientId, redirectUri, challenge: await codeChallenge(codeVerifier), state });

  let redirected;
  try {
    redirected = await identity.launchWebAuthFlow({ url, interactive: true });
  } catch (error) {
    if (CANCEL_PATTERN.test(error?.message ?? '')) throw new SignInCancelled();
    throw error;
  }
  if (!redirected) throw new SignInCancelled();
  const code = parseRedirect(redirected, state);

  const firstSeenAt = await ensureFirstSeen(storage);
  const response = await fetchFn(`${serverUrl}/v1/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier, redirectUri, firstSeenAt }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`server answered ${response.status}`);
  const { token, email, accountId } = await response.json();
  if (!token || !email) throw new Error('server answered without a session');
  const account = { email, token, accountId };
  await storage.local.set({ [ACCOUNT_KEY]: account });
  return account;
}

// The local session is removed whatever the server says, so a failed request cannot trap the user.
export async function signOut({ storage = chrome.storage, fetchFn = fetch, serverUrl = SERVER_URL } = {}) {
  const account = await loadAccount(storage);
  try {
    if (account && serverUrl) {
      await fetchFn(`${serverUrl}/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${account.token}` },
        body: '{}',
      });
    }
  } catch {
    // Offline or server down: still sign out here.
  } finally {
    await storage.local.remove(ACCOUNT_KEY);
  }
}

export async function loadAccount(storage = chrome.storage) {
  const data = await storage.local.get(ACCOUNT_KEY);
  return data[ACCOUNT_KEY] ?? null;
}
