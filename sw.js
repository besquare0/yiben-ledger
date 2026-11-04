const CACHE='yiben-shell-v3';
const FILES=['./','./index.html','./styles.css','./app.js','./domain.js','./storage.js','./icons.js','./demo.js','./icon.svg','./manifest.webmanifest','./preview.html','./preview.css','./preview.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('yiben-shell-')&&k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();caches.open(CACHE).then(c=>c.put(event.request,clone));}return response;}).catch(()=>caches.match(event.request).then(c=>c||Response.error())));
});
