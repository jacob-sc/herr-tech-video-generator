/**
 * Standalone-Stub: kein Email-Versand im lokalen Modus.
 *
 * Falls API-Routen `sendEmail`/`sendNotification` importieren, sind das
 * No-Ops, die nur loggen.
 */

export async function sendEmail(opts) {
  console.log('[email-stub] sendEmail (no-op):', opts?.subject ?? '(no subject)')
  return { ok: true, skipped: true }
}

export async function sendNotification(opts) {
  console.log('[email-stub] sendNotification (no-op):', opts?.subject ?? '(no subject)')
  return { ok: true, skipped: true }
}
