/* Service worker «Кадра за кадром».
   Задача: чтобы оболочка приложения открывалась даже без связи и чтобы
   Chrome разрешил установку на главный экран. Данные (фразы, видео, картинки)
   тут НЕ кэшируются — они всегда идут напрямую на твой сервер. */
var CACHE = 'kadr-shell-v1';
var FONTS = 'kadr-fonts-v1';
var SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k !== FONTS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Сначала сеть (чтобы новая версия index.html появлялась сразу),
// но если сети нет или она тормозит дольше 3 секунд — берём сохранённую копию.
function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    function finish(res) { if (!done && res) { done = true; resolve(res); } }
    var timer = setTimeout(function () { caches.match(req, { ignoreSearch: true }).then(finish); }, 3000);
    fetch(req).then(function (res) {
      clearTimeout(timer);
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      finish(res);
    }).catch(function () {
      clearTimeout(timer);
      caches.match(req, { ignoreSearch: true }).then(function (r) {
        if (r) return finish(r);
        if (req.mode === 'navigate') return caches.match('index.html').then(function (idx) { finish(idx || Response.error()); });
        finish(Response.error());
      });
    });
  });
}

// Шрифты Google: отдаём из кэша, а в фоне обновляем.
function fontsStale(req) {
  return caches.open(FONTS).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { c.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { e.respondWith(fontsStale(req)); return; }
  // всё остальное (запросы к серверу с данными) не трогаем
});
