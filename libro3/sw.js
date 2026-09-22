/* ============================================================
   NPI Service Worker
   - *.mp3         ：CacheFirst，听过一次即永久本地命中，兼容 Range 206
   - *.js / *.css  ：CacheFirst，缓存桶按「构建戳」划分
       桶名里的 78f7b706 由 tools/stamp_shell.js 按这些文件的内容哈希生成，
       每次部署重新计算 —— 内容一变戳就变，新 SW 激活时旧桶自动丢弃。
       于是一方面「二次访问零网络请求」，另一方面不会再把旧 CSS/JS 缓住。
       ⚠️ 改完 js/ css/ data/ 必须重跑 tools/stamp_shell.js 再部署。
   - HTML          ：不拦截，永远走网络，保证入口页面即时更新
   ============================================================ */
const CACHE_NAME = 'npi-audio-v3';
const SHELL_CACHE = 'npi-shell-78f7b706';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => (k.indexOf('npi-audio-') === 0 && k !== CACHE_NAME) ||
                         (k.indexOf('npi-shell-') === 0 && k !== SHELL_CACHE))
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

/* 解析 Range 头，返回 {start, end}；不支持或非法返回 null / {invalid:true} */
function parseRange(header, size) {
  const m = /bytes=(\d*)-(\d*)/.exec(header || '');
  if (!m) return null;
  let start = m[1] === '' ? null : parseInt(m[1], 10);
  let end = m[2] === '' ? null : parseInt(m[2], 10);
  if (start === null && end === null) return null;
  if (start === null) { start = Math.max(0, size - end); end = size - 1; }  /* 后缀区间 */
  if (end === null || end >= size) end = size - 1;
  if (start > end || start >= size || size <= 0) return { invalid: true };
  return { start, end };
}

function sliceResponse(cached, start, end, size) {
  return cached.arrayBuffer().then((buf) => {
    const chunk = buf.slice(start, end + 1);
    return new Response(chunk, {
      status: 206,
      statusText: 'Partial Content',
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Length': String(chunk.byteLength),
        'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
        'Accept-Ranges': 'bytes',
      },
    });
  });
}

/* 壳资源（js / css）：缓存优先。
   缓存桶名带构建戳 —— 内容一变就换桶，所以命中的一定是当前版本，
   不需要每次回源校验，二次访问可做到零网络请求。
   未命中（首次访问 / 刚发新版）时强制回源校验，拿到的一定是最新字节。 */
async function shellCacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const resp = await fetch(req, { cache: 'no-cache' });
    if (resp && resp.status === 200) cache.put(req, resp.clone()).catch(() => {});
    return resp;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  /* 音频：内容哈希命名，永久缓存 + 兼容 Range */
  if (url.pathname.endsWith('.mp3')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const key = url.origin + url.pathname;
      let hit = await cache.match(key);

      if (!hit) {
        let resp;
        try {
          resp = await fetch(key, { credentials: 'omit' });
        } catch (err) {
          return Response.error();
        }
        if (!resp || resp.status !== 200) return resp;
        cache.put(key, resp.clone()).catch(() => {});   /* 后台写缓存，不阻塞本次响应 */
        hit = resp.clone();
      }

      const rangeHeader = req.headers.get('range');
      if (!rangeHeader) return hit;

      const size = parseInt(hit.headers.get('content-length') || '0', 10);
      const r = parseRange(rangeHeader, size);
      if (!r || r.invalid) return hit;
      return sliceResponse(hit, r.start, r.end, size);
    })());
    return;
  }

  /* 代码类壳资源（含 data/*.js 数据切片）：缓存优先，桶名带构建戳 */
  if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
    event.respondWith(shellCacheFirst(req));
    return;
  }

  /* 其余（HTML / 图片等）不拦截，交由浏览器与网络处理 */
});
