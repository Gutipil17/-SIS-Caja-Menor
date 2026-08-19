const CACHE='sis-gastos-v1.9.5';
const CORE=['./','./index.html','./styles.css','./app.js','./official-pagination.js','./assets-bundle.js','./manifest.webmanifest','./vendor/jspdf.umd.min.js','./vendor/exceljs.min.js','./vendor/pdf.min.js','./vendor/pdf.worker.min.js','./assets/sis-logo.png','./assets/icon-192.png','./assets/icon-512.png','./assets/apple-touch-icon.png','./assets/favicon-32.png','./assets/favicon-16.png','./assets/plantilla_SCOF01.xlsx','./assets/plantilla_VIATICOS.xlsx','./assets/formato_SCOF01_oficial.png','./assets/formato_VIATICOS_oficial.png','./version.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);

  if(request.method!=='GET') return;

  if(request.mode==='navigate' || /\/(index\.html|app\.js|styles\.css|manifest\.webmanifest|version\.json)$/.test(url.pathname)){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
          return response;
        })
        .catch(()=>caches.match(request).then(r=>r||caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached||fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy));
      return response;
    }))
  );
});
