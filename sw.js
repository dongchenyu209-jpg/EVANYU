/* Love Diary PWA service worker */
const CACHE = 'love-diary-v135';   // 每次改了 index.html 等文件发布时，把这个版本号 +1，旧缓存会在 activate 时自动清掉
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/notify.wav',
  './assets/keepalive.wav',
  './assets/icon-192.png',
  './assets/icon-512.png'
];
var BASE = new URL('./', self.location).pathname;
var INDEX_URL = new URL('./index.html', self.location).href;
var ALLOWED = PRECACHE.map(function(u){ return new URL(u, self.location).pathname; });

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      // 逐个缓存：某个文件缺失时不会连累其它文件（addAll 是全有或全无）
      .then(function(c){ return Promise.all(PRECACHE.map(function(u){ return c.add(u).catch(function(){}); })); })
      .then(function(){ return self.skipWaiting(); })
  );
});
self.addEventListener('activate', function(e){
  e.waitUntil(
    // 只留当前版本的缓存，其余（旧版本、别的名字）全部删掉
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

function isSameOrigin(req){ return req.url.indexOf(self.location.origin)===0; }
// 只缓存白名单里的文件（预缓存列表 + assets/ 下的静态资源）；带 ?参数 的、sw.js 自己、其它杂项一律不缓存，避免堆出没用的缓存
function cacheable(url){
  if(url.search) return false;
  if(/\/sw\.js$/.test(url.pathname)) return false;
  return ALLOWED.indexOf(url.pathname) >= 0 || url.pathname.indexOf(BASE + 'assets/') === 0;
}
function putInCache(keyReq, res){
  try{
    if(res && res.ok && res.status===200 && cacheable(new URL(keyReq.url))){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(keyReq, copy); });
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
  if(/\/sw\.js$/.test(url.pathname)) return;   // sw.js 本身始终走网络，不进缓存

  var isNav = req.mode === 'navigate';
  var isDoc = isNav || /\.(html|webmanifest)$/.test(url.pathname) || /\/$/.test(url.pathname);

  if(isDoc){
    // 页面本身：缓存优先，打开即秒显，不联网也能用；后台再去拉新版本，下次刷新生效
    // 所有页面导航（含带 ?参数 的）统一用 index.html 当缓存键，不会为每个地址各存一份
    var keyReq = isNav ? new Request(INDEX_URL) : req;
    e.respondWith(
      caches.match(keyReq).then(function(cached){
        var net = fetch(req).then(function(res){ putInCache(keyReq, res); return res; })
          .catch(function(){ return cached || caches.match(INDEX_URL) || Response.error(); });
        if(cached) e.waitUntil(net.catch(function(){}));
        return cached || net;
      })
    );
    return;
  }
  // 白名单之外的请求不接管，交给浏览器自己处理
  if(!cacheable(url)) return;
  // 图片、音频等静态资源：缓存优先，后台顺便更新
  e.respondWith(
    caches.match(req).then(function(cached){
      var net = fetch(req).then(function(res){ putInCache(req, res); return res; }).catch(function(){ return cached || Response.error(); });
      if(cached) e.waitUntil(net.catch(function(){}));
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
