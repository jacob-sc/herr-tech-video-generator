import crypto from 'crypto';

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(part => {
    const [name, ...rest] = part.trim().split('=');
    if (name) cookies[name.trim()] = rest.join('=').trim();
  });
  return cookies;
}

/**
 * Returns the user's persistent ID from the ht_uid cookie.
 * If none exists, creates one and sets the cookie in the response.
 */
export function getOrCreateUserId(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.ht_uid && cookies.ht_uid.length >= 16) return cookies.ht_uid;

  const uid = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie', `ht_uid=${uid}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`);
  return uid;
}

export function getUserId(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.ht_uid || null;
}
