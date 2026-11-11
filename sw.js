const CACHE = "vattna-lundin-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./icons/fredskalla.webp",
  "./icons/ginsengfikus.webp",
  "./icons/anthurium.webp",
  "./icons/paraplyaralia.webp",
  "./icons/bergpalm.webp",
  "./icons/gummitrad.webp",
  "./icons/aeonium.webp",
  "./icons/peperomia.webp",
  "./icons/clusia.webp",
  "./icons/orkide.webp",
  "./icons/svarrmorstunga_rund.webp",
  "./icons/svarrmorstunga_gra.webp",
  "./icons/svarrmorstunga_brun.webp",
  "./icons/euphorbia.webp",
  "./icons/zamioculcas.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
