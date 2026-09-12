/* ============================================================
   NPI 音频缓存 Service Worker
   - 只接管同源 *.mp3：CacheFirst，首次听过之后永久命中本地缓存，不再走网络
   - 其它资源（HTML / JS / CSS / 图片）一律不缓存，保证站点更新即时生效
   - 兼容 <audio> 的 Range 分段请求：命中缓存时按需切片返回 206
   ============================================================ */
const CACHE_NAME = 'npi-audio-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.indexOf('npi-audio-') === 0 && k !== CACHE_NAME).map((k) => caches.delete(k))
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.endsWith('.mp3')) return;      /* 只接管音频，别的都不碰 */

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
});
