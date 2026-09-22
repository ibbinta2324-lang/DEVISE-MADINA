/* =====================================================================
   DEVISE MADINA — SERVICE WORKER (phase 5)
   But : l'application s'ouvre même sans internet.
   - Les fichiers du site sont gardés en mémoire (cache).
   - Les données (Supabase) ne sont JAMAIS mises en cache : elles
     contiennent des informations de compte.
   Après chaque modification du site, changer le numéro de VERSION.
   ===================================================================== */

const VERSION = "dm-v3";

const FICHIERS = [
  "./",
  "./index.html",
  "./app.css",
  "./config.js",
  "./supabase.js",
  "./outils.js",
  "./api.js",
  "./assistant.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icone-192.png",
  "./icone-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FICHIERS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const requete = e.request;

  // On ne touche qu'aux fichiers de ce site, en lecture
  if (requete.method !== "GET" || new URL(requete.url).origin !== self.location.origin) return;

  // Navigation : on montre l'application même hors ligne
  if (requete.mode === "navigate") {
    e.respondWith(
      fetch(requete).catch(() => caches.match("./index.html", { ignoreSearch: true }))
    );
    return;
  }

  // Fichiers : on répond tout de suite avec le cache, et on met à jour derrière
  e.respondWith(
    caches.match(requete, { ignoreSearch: true }).then((enCache) => {
      const reseau = fetch(requete).then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(VERSION).then((cache) => cache.put(requete, copie));
        }
        return reponse;
      }).catch(() => enCache);
      return enCache || reseau;
    })
  );
});
