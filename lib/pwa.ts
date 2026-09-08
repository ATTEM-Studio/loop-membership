import type {MetadataRoute} from 'next'

export const LOOP_THEME_COLOR='#F3F5F8'

export function buildLoopManifest():MetadataRoute.Manifest{
  return {
    id:'/',
    name:'LOOP — 매장 멤버십',
    short_name:'LOOP',
    description:'고객의 재방문을 만드는 매장용 멤버십',
    start_url:'/',
    scope:'/',
    display:'standalone',
    background_color:LOOP_THEME_COLOR,
    theme_color:LOOP_THEME_COLOR,
    categories:['business','productivity'],
    icons:[
      {src:'/pwa-icon/192',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/pwa-icon/512',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/pwa-icon/512?purpose=maskable',sizes:'512x512',type:'image/png',purpose:'maskable'},
    ],
  }
}

export function shouldCacheLoopRequest(method:string,pathname:string){
  if(method!=='GET')return false
  if(pathname.startsWith('/api/'))return false
  return pathname.startsWith('/_next/static/')||pathname.startsWith('/pwa-icon/')
}
