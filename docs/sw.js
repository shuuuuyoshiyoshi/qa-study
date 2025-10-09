// キャッシュ名は更新のたびに上げると確実に反映（例: qa-cache-v2）
const CACHE = 'qa-cache-v1';

self.addEventListener('install', evt => {
    evt.waitUntil(caches.open(CACHE).then(cache => cache.addAll([
        './', './index.html', './style.css', './app.js', './manifest.json', './data/勉強用.csv'
    ])));
});

self.addEventListener('fetch', evt => {
    evt.respondWith(
        caches.match(evt.request).then(resp => resp || fetch(evt.request))
    );
});