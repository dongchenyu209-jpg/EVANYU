/* Love Diary PWA service worker */
const CACHE = 'love-diary-v58';   // 每次改了 index.html 等文件发布时，把这个版本号 +1，旧缓存会在 activate 时自动清掉
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/notify.wav',
  './assets/keepalive.wav',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(PRECACHE).catch(function(){}); })
      .then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isSameOrigin(req){ return req.url.indexOf(self.location.origin)===0; }
function putInCache(req, res){
  try{
    if(res && res.ok && res.status===200 && isSameOrigin(req)){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(req, copy); });
    }
  }catch(err){}
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  // 音频/视频的 Range 请求交给浏览器自己处理：SW 用完整的 200 响应去回 Range 请求，iOS Safari 上会播不出来
  if(req.headers.has('range')) return;
  if(!isSameOrigin(req)) return;

  var url = new URL(req.url);
  var isDoc = req.mode === 'navigate' || /\.(html|webmanifest)$/.test(url.pathname) || /\/$/.test(url.pathname) || /\/sw\.js$/.test(url.pathname);

  if(isDoc){
    // 页面本身：缓存优先，打开即秒显，不联网也能用；后台再去拉新版本，下次刷新生效
    e.respondWith(
      caches.match(req).then(function(cached){
        var net = fetch(req).then(function(res){ putInCache(req, res); return res; }).catch(function(){ return cached || caches.match('./index.html'); });
        return cached || net;
      })
    );
    return;
  }
  // 图片、音频等静态资源：缓存优先，后台顺便更新
  e.respondWith(
    caches.match(req).then(function(cached){
      var net = fetch(req).then(function(res){ putInCache(req, res); return res; }).catch(function(){ return cached; });
      return cached || net;
    })
  );
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type:'window', includeUncontrolled:true }).then(function(clientList){
    for (var i=0;i<clientList.length;i++){
      if ('focus' in clientList[i]) return clientList[i].focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow('./index.html');
  }));
});
