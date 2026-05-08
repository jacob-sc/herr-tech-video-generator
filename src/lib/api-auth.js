/**
 * Standalone-Stub: Im lokalen Single-User-Modus gibt es keine Auth.
 *
 * Diese Datei ersetzt die ursprüngliche NextAuth-basierte Auth-Logik.
 * Alle API-Routen, die `requireAuth`/`isAdmin` importieren, bekommen
 * automatisch den lokalen Default-User zurück.
 */

const LOCAL_USER = {
  id: 'local-user',
  email: 'local@localhost',
  name: 'Local User',
  role: 'admin',
}

export async function requireAuth(_req, _res) {
  return LOCAL_USER
}

export async function isAdmin(_req) {
  return true
}

export async function getCurrentUser(_req) {
  return LOCAL_USER
}
