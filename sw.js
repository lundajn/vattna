const CACHE = "vattna-lundin-v5";
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
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting())
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
  const url = new URL(req.url);
  const isIcon = url.pathname.includes("/icons/") || url.pathname.endsWith(".png");
  if (isIcon) {
    // Bilder: cache först
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }))
    );
    return;
  }
  // Sidan, koden och stilen: nätet först så att nya versioner syns direkt
  event.respondWith(
    fetch(new Request(req, { cache: "no-store" })).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
