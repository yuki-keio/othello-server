const CACHE_NAME = "my-django-app-cache-v3";
const urlsToCache = [
    "/",  // ホーム
    "/ai/",
    "/en/",  // 英語版ホーム
    "/en/ai/",  
    "/offline.html",  
    "/en/offline.html",  
    "/strategy-reversi-othello.html", 
    "/en/strategy-reversi-othello.html",
    "/static/game/images/favicon/favicon.ico",
    "/static/game/images/favicon/favicon-192x192.png",
    "/static/game/images/favicon/favicon-512x512.png",
    "/static/game/images/favicon/apple-touch-icon.png",
    "/static/game/script.js",
    "/static/game/confetti.browser.min.js",
    "/static/game/images/setting.svg",
    "/static/game/images/qr.svg",
    "/static/game/images/copy.webp",
    "/static/game/sounds/defeat.mp3",
    "/static/game/sounds/victory.mp3",
    "/static/game/sounds/place-stone.mp3",
    "/static/game/sounds/warning.mp3",
    "/static/game/style.css",
    "/static/game/strategy.css"
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
    if (!navigator.onLine) {
        // オフライン時に "/online-match" へアクセスしようとしたら、オフラインページへリダイレクト
        if (event.request.url.includes("/online")) {
            const lang = window.location.pathname.split('/').filter(Boolean)[0];
            switch (lang) {
                case "en":
                    event.respondWith(caches.match("/en/offline.html"));
                    break;
            
                default:
                    event.respondWith(caches.match("/offline.html"));
                    break;
            }
            return;
        }
    }
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
