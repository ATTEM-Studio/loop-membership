const LOOP_STATIC_CACHE='loop-static-v1'

self.addEventListener('install',()=>{
  self.skipWaiting()
})

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys()
    await Promise.all(keys.filter(key=>key.startsWith('loop-static-')&&key!==LOOP_STATIC_CACHE).map(key=>caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch',event=>{
  const request=event.request
  if(request.method!=='GET')return

  const url=new URL(request.url)
  if(url.origin!==self.location.origin)return
  if(url.pathname.startsWith('/api/'))return

  const cacheable=url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/pwa-icon/')
  if(!cacheable)return

  event.respondWith((async()=>{
    const cache=await caches.open(LOOP_STATIC_CACHE)
    const cached=await cache.match(request)
    if(cached)return cached

    const response=await fetch(request)
    if(response.ok)await cache.put(request,response.clone())
    return response
  })())
})
