const CACHE_NAME = "my-django-app-cache-v2";
const urlsToCache = [
    "https://reversi.yuki-lab.com/",
    "https://reversi.yuki-lab.com/strategy-reversi-othello.html",
    "https://reversi.yuki-lab.com/static/game/images/favicon/favicon.ico",
    "https://reversi.yuki-lab.com/static/game/images/favicon/favicon-192x192.png",
    "https://reversi.yuki-lab.com/static/game/images/favicon/favicon-512x512.png",
    "https://reversi.yuki-lab.com/static/game/images/favicon/apple-touch-icon.png",
    "https://reversi.yuki-lab.com/static/game/script.js",
    "https://reversi.yuki-lab.com/static/game/confetti.browser.min.js",
    "https://reversi.yuki-lab.com/static/game/images/setting.svg",
    "https://reversi.yuki-lab.com/static/game/images/qr.svg",
    "https://reversi.yuki-lab.com/static/game/images/copy.webp",
    "https://reversi.yuki-lab.com/static/game/sounds/defeat.mp3",
    "https://reversi.yuki-lab.com/static/game/sounds/victory.mp3",
    "https://reversi.yuki-lab.com/static/game/sounds/place-stone.mp3",
    "https://reversi.yuki-lab.com/static/game/sounds/warning.mp3",
    "https://reversi.yuki-lab.com/static/game/style.css",
    "https://reversi.yuki-lab.com/static/game/strategy.css",
];

// インストール時にキャッシュする
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// キャッシュを使ってリクエストを処理
self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request)).catch(error => {
                console.error("Fetch Error:", error);
            })
    );
});

// 古いキャッシュを削除
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
                          .map(cacheName => caches.delete(cacheName))
            );
        })
    );
});
