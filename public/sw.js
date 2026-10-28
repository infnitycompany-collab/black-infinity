/* No private cache. Vault keys exist only in volatile worker memory. */
const vaults=new Map();
const PUBLIC_CACHE='bi-public-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(PUBLIC_CACHE).then(cache=>cache.addAll(['/offline.html','/icon.svg']))));
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('bi-public-')&&k!==PUBLIC_CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('message',event=>{
 if(!event.source?.url||new URL(event.source.url).origin!==self.location.origin)return;
 const d=event.data;if(d?.type==='VAULT_OPEN'&&d.key instanceof CryptoKey&&/^[a-f0-9-]{36}$/.test(d.id)){
  const handle=crypto.randomUUID();vaults.set(handle,{...d,clientId:event.source.id,until:Date.now()+30*60*1000});event.ports[0]?.postMessage({url:`/__vault/${handle}`});
 }else if(d?.type==='VAULT_CLOSE')vaults.delete(d.handle);
 else if(d?.type==='LOCK')vaults.clear();
});
function nonce(prefix,index){const b=Uint8Array.from(atob(prefix),c=>c.charCodeAt(0));const iv=new Uint8Array(12);iv.set(b);new DataView(iv.buffer).setUint32(8,index);return iv;}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
 if(event.request.mode==='navigate'&&!url.pathname.startsWith('/__vault/')){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));return;}
 if(!url.pathname.startsWith('/__vault/'))return;
 event.respondWith((async()=>{
  const handle=url.pathname.split('/')[2],v=vaults.get(handle);if(!v||v.until<Date.now()||event.clientId!==v.clientId)return new Response('Unlock the vault again',{status:403});
  v.until=Date.now()+30*60*1000;
  let start=0,end=v.size-1;const range=event.request.headers.get('range');if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416});start=m[1]?Number(m[1]):Math.max(0,v.size-Number(m[2]));end=m[1]?(m[2]?Math.min(Number(m[2]),end):end):end;}
  if(start>end||start>=v.size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${v.size}`}});
  let at=start,cancelled=false;const size=4*1024*1024;
  const stream=new ReadableStream({async pull(controller){
   try{if(cancelled||at>end){controller.close();return;}const idx=Math.floor(at/size);
    const r=await fetch(`/api/v1/media/${v.id}/chunks/${idx}`,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('Access expired');
    const cipher=await r.arrayBuffer();const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce(v.prefix,idx),additionalData:new TextEncoder().encode(`BI-V1:${v.id}:${idx}:${v.size}`)},v.key,cipher);
    const offset=at-idx*size,take=Math.min(data.byteLength-offset,end-at+1);if(take<=0)throw new Error('Invalid chunk');controller.enqueue(new Uint8Array(data,offset,take));at+=take;
   }catch{vaults.delete(handle);controller.error(new Error('Media unavailable or authentication failed'));}
  },cancel(){cancelled=true;}});
  const safeMime=/^(video|audio)\/[a-z0-9.+-]+$/i.test(v.mime)?v.mime:'application/octet-stream';
  const headers={'Content-Type':safeMime,'Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(range)headers['Content-Range']=`bytes ${start}-${end}/${v.size}`;
  return new Response(stream,{status:range?206:200,headers});
 })());
});
self.addEventListener('push',event=>event.waitUntil(self.registration.showNotification('Black Infinity',{body:'You have an update. Open Black Infinity to view it.',icon:'/icon.svg',tag:'black-infinity-update',data:{url:'/app/notifications'}})));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(self.clients.openWindow('/app/notifications'));});
