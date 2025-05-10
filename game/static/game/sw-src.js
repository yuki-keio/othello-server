const CACHE_NAME = `reversi-web-${__TS__}`; // __TS__はビルド時に置き換えられます
const urlsToCache = [
    "/",
    "/ai/",
    "/en/",  // 英語版ホーム
    "/en/ai/",
    "/offline.html",
    "/en/offline.html",
    "/strategy-reversi-othello.html",
    "/en/strategy-reversi-othello.html",
    "/static/game/images/favicon/favicon.ico",
    "/static/game/images/favicon/favicon-16x16.png",
    "/static/game/images/favicon/favicon-32x32.png",
    "/static/game/images/icons/apple-touch-icon.png",
    "/static/game/images/icons/reversi_icon-large.png",
    "/static/game/images/icons/reversi_icon-min.png",
    "/static/game/images/qr.svg",
    "/static/game/images/share.svg",
    "/static/game/images/draw.png",
    "/static/game/images/win.png",
    "/static/game/images/lose.png",
    "/static/game/images/iOSinstall.webp",
    "/static/game/images/info.svg",
    "/static/game/images/laurel.webp",
    "/static/game/sounds/defeat.mp3",
    "/static/game/sounds/victory.mp3",
    "/static/game/sounds/place-stone.mp3",
    "/static/game/sounds/playerJoin.mp3",
    "/static/game/sounds/warning.mp3",
    "/static/game/style.min.css",
    "/static/game/strategy.css",
    "/static/game/script.min.js",
    "/static/game/online.min.js",
    "/static/game/ai.min.js",
    "/static/game/worker.min.js",
    "/static/game/signup.css",
    "/static/game/login.css",
    "/static/game/payment_success.css",
    "/static/game/confetti.browser.min.js",
];

// インストール時にキャッシュする
self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log(`Service Worker: Caching all assets (${CACHE_NAME})`);
                return cache.addAll(urlsToCache);
            })
    );
});

// キャッシュ優先の戦略 (Cache First)
self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    const excludedPaths = ["/login/", "/signup/", "/logout/", "/premium-intent/"];
    const isApiPath = /^\/([a-z]{2}\/)?api\//.test(url.pathname);
    if (
        excludedPaths.includes(url.pathname) ||
        isApiPath ||
        event.request.method !== "GET" ||
        url.origin !== self.location.origin
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request).then(networkResponse => {
                if (networkResponse.status === 200) {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {
                return cachedResponse;
            });
        })
    );
});

// 古いキャッシュを削除
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName.startsWith("reversi-web-") && cacheName !== CACHE_NAME)
                    .map(cacheName => {
                        console.log(`Service Worker: Deleting old cache (${cacheName})`);
                        return caches.delete(cacheName);
                    })
            );
        }).then(() => self.clients.claim())
    );
});
