/**
 * Standalone-Stub: Im lokalen Single-User-Modus gibt es keine Auth.
 *
 * Diese Datei ersetzt die ursprüngliche NextAuth-basierte Auth-Logik.
 * Alle API-Routen, die `requireAuth` importieren, bekommen automatisch
 * `{ session, ownerId, user }` mit dem lokalen Default-User zurück.
 */

const LOCAL_USER = {
  id: 'local-user',
  email: 'local@localhost',
  name: 'Local User',
  role: 'admin',
};

const LOCAL_SESSION = {
  user: LOCAL_USER,
  expires: '2099-01-01T00:00:00.000Z',
};

export async function requireAuth(_req, _res) {
  return {
    session: LOCAL_SESSION,
    ownerId: LOCAL_USER.id,
    user: LOCAL_USER,
  };
}

export function isAdmin(_session) {
  return true;
}

export async function getCurrentUser(_req) {
  return LOCAL_USER;
}
