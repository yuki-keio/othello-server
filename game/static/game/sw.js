const CACHE_NAME = "my-django-app-cache-v7";
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
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
});

// キャッシュを使ってリクエストを処理
self.addEventListener("fetch", event => {
    if (event.request.url.includes("/online")) {
        const lang = location.pathname.split('/').filter(Boolean)[0];
        switch (lang) {
            case "en":
                event.respondWith(
                    fetch(event.request,{ cache: "no-store", mode: "no-cors"}) // ネットワークにアクセスを試みる
                        .catch(() => { // ネットワークエラーならオフラインページを返す
                            return caches.match("/en/offline.html")
                        })
                );

                break;

            default:
                event.respondWith(
                    fetch(event.request,{ cache: "no-store", mode: "no-cors"}) // ネットワークにアクセスを試みる
                        .catch(() => { // ネットワークエラーならオフラインページを返す
                            return caches.match("/offline.html")
                        })
                );

                break;
        }
        return;
    }
    console.log("request:", event.request.url.replace(location.origin, "").replace("https://reversi.yuki-lab.com", "").replace(/(\.[a-f0-9]{8,})(\.[^/.]+)$/, "$2"));
    event.respondWith(
        caches.match(event.request.url.replace(location.origin, "").replace("https://reversi.yuki-lab.com", "").replace(/(\.[a-f0-9]{8,})(\.[^/.]+)$/, "$2"))
            .then(response => response || fetch(event.request)).catch(error => {
                console.error("Fetch Error(not '/online/' page):", error);
                return new Response("Offline content not available", {
                    status: 503,
                    statusText: "Service Unavailable",
                    headers: { "Content-Type": "text/plain" }
                });
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
