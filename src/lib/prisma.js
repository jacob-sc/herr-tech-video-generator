/**
 * Standalone-Modus: Keine Datenbank.
 *
 * Im Single-User-Local-Modus sind die Statistik-Counter
 * (projectsCreated/imagesGenerated/videosGenerated) bedeutungslos —
 * der lokale User bist du selbst. Diese Datei liefert daher einen
 * No-Op-Mock von Prisma, damit alle API-Routen ohne Code-Änderungen
 * weiter funktionieren. Projekte, Szenen, Bilder, Videos werden
 * komplett im Filesystem unter `data/projects/<id>/` gemanaged.
 *
 * Wenn du das Tool später mit echter DB ausstatten willst (Multi-User-
 * SaaS), tausch diese Datei wieder gegen die ursprüngliche
 * PrismaClient-Initialisierung aus.
 */

const noopAsync = async () => ({});
const emptyArrayAsync = async () => [];

const userStub = {
  update: noopAsync,
  upsert: noopAsync,
  create: noopAsync,
  delete: noopAsync,
  findUnique: async () => null,
  findFirst: async () => null,
  findMany: emptyArrayAsync,
  count: async () => 0,
};

const prisma = {
  user: userStub,
  $connect: noopAsync,
  $disconnect: noopAsync,
};

module.exports = { prisma };
