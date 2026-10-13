// =========================================================
// サービスワーカー：電波が悪い場所でもアプリをすぐ開けるようにする仕組み
//
// 方針：保存しておいた版をすぐ表示しつつ、裏で最新版を取りに行く。
// （そのため、GitHubのファイルを更新したときは
//   「1回開く → 閉じる → もう1回開く」で新しい版になります）
// =========================================================

const CACHE_NAME = 'kakeibo-v1';

// 最初に保存しておくファイル
const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });

      // 裏で最新版を取りに行き、取れたら保存し直す
      const latest = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);

      // 保存済みの版があればそれをすぐ返す。なければネットの結果を待つ
      return cached || latest;
    })
  );
});
