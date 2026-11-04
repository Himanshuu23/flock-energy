const { HttpError, SessionExpiredError } = require('../utils/errors');
const { parsePageResponse } = require('./svelteData');

const RETRY_STATUSES = [502, 503, 504];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createPortalClient({ baseUrl, username, password, timeoutMs = 15000, retries = 3, retryDelayMs = 300 }) {
  const cookies = new Map();
  let expiresAt = 0;
  let loginPromise = null;

  function cookieHeader() {
    return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  function storeCookies(res) {
    const lines = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie')].filter(Boolean);

    for (const line of lines) {
      const [pair, ...attributes] = line.split(';');
      const eq = pair.indexOf('=');
      if (eq < 1) continue;

      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();

      if (value === '') {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }

      if (name.includes('session_token')) {
        const maxAge = attributes.map((a) => a.trim()).find((a) => a.toLowerCase().startsWith('max-age='));
        const seconds = maxAge ? Number(maxAge.split('=')[1]) : 3600;
        expiresAt = Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000;
      }
    }
  }

  async function send(path, options = {}) {
    let lastError;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(baseUrl + path, {
          ...options,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (RETRY_STATUSES.includes(res.status) && attempt < retries) {
          await sleep(retryDelayMs * attempt);
          continue;
        }

        return res;
      } catch (err) {
        lastError = err;
        if (attempt < retries) await sleep(retryDelayMs * attempt);
      }
    }

    throw new HttpError(502, 'portal_unreachable', `Could not reach the portal: ${lastError.message}`);
  }

  async function login() {
    const res = await send('/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
        origin: baseUrl,
        'x-sveltekit-action': 'true'
      },
      body: new URLSearchParams({ email: username, password }).toString()
    });

    let ok = res.status === 302 || res.status === 303;
    if (!ok && res.ok) {
      const body = await res.json().catch(() => null);
      ok = Boolean(body) && body.type === 'redirect';
    }

    if (!ok) {
      throw new HttpError(502, 'portal_login_failed', `Portal login was rejected (status ${res.status})`);
    }

    cookies.clear();
    storeCookies(res);

    if (cookies.size === 0) {
      throw new HttpError(502, 'portal_login_failed', 'Portal login did not return a session cookie');
    }
  }

  async function ensureSession() {
    const stillValid = cookies.size > 0 && Date.now() < expiresAt - 60000;
    if (stillValid) return;

    if (!loginPromise) {
      loginPromise = login().finally(() => {
        loginPromise = null;
      });
    }
    await loginPromise;
  }

  async function readJson(res) {
    if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
      throw new SessionExpiredError();
    }
    if (res.status === 404) {
      throw new HttpError(404, 'not_found', 'The portal has no such resource');
    }
    if (!res.ok) {
      throw new HttpError(502, 'portal_error', `The portal answered with status ${res.status}`);
    }
    try {
      return await res.json();
    } catch (err) {
      throw new HttpError(502, 'portal_bad_response', 'The portal returned something that is not JSON');
    }
  }

  async function authed(path, read) {
    await ensureSession();

    for (let attempt = 1; attempt <= 2; attempt++) {
      const used = cookieHeader();
      const res = await send(path, { headers: { cookie: used, accept: 'application/json' } });
      storeCookies(res);

      try {
        return await read(res);
      } catch (err) {
        if (!(err instanceof SessionExpiredError)) throw err;
        if (attempt === 2) {
          throw new HttpError(502, 'portal_session_rejected', 'The portal keeps rejecting the session');
        }
        if (cookieHeader() === used) cookies.clear();
        await ensureSession();
      }
    }
  }

  function getJson(path) {
    return authed(path, readJson);
  }

  function getPageData(path) {
    return authed(path, async (res) => parsePageResponse(await readJson(res)));
  }

  return { getJson, getPageData };
}

module.exports = { createPortalClient };
