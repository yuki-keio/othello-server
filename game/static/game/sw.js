const CACHE_NAME = "my-django-app-cache-v19";
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
    "/static/game/strategy.css",
];

// インストール時にキャッシュする
self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// キャッシュを使ってリクエストを処理
self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    // CDNからのフォントなどは毎回ネットワーク取得する。
    if (((url.origin === "https://fonts.gstatic.com" || url.origin === "https://fonts.googleapis.com") && event.request.destination === "font") || url.origin === "https://cdn.jsdelivr.net" || url.origin === "https://cdnjs.cloudflare.com") {
        event.respondWith(
            fetch(event.request, { mode: "cors", credentials: "omit" })
        );
        return;
    }

    // Stale-While-Revalidate 戦略
    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            const cacheKey = url.pathname;
            return cache.match(cacheKey).then(cachedResponse => {
                // ネットワークから新鮮なデータを取得し、取得できたらキャッシュを更新
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {
                        // ステータス200ならキャッシュへ保存
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(cacheKey, networkResponse.clone());
                        }
                        return networkResponse;
                    })
                    .catch(err => {
                        // ネットワークエラー時はキャッシュを返す
                        console.error("Fetch failed; returning cached data if available.", err);
                        return cachedResponse;
                    });

                // まずキャッシュがあればそれを返し、なければネットワーク取得を待つ
                return cachedResponse || fetchPromise;
            });
        })
    );
});

// 古いキャッシュを削除
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            console.log('Service Worker activated')
            return Promise.all(
                cacheNames.filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim())
    );
});
