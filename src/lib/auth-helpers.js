/**
 * Standalone-Stub: keine Auth im lokalen Single-User-Modus.
 */

const LOCAL_USER = {
  id: 'local-user',
  email: 'local@localhost',
  name: 'Local User',
  role: 'admin',
}

export async function getCurrentUser() {
  return LOCAL_USER
}

export async function requireUser() {
  return LOCAL_USER
}

export async function requireAdmin() {
  return LOCAL_USER
}
