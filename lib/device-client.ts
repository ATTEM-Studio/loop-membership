export const DEVICE_SESSION_KEY='LOOP_DEVICE_SESSION'
export const DEVICE_ID_KEY='LOOP_DEVICE_ID'

export type DeviceSession={token:string;storeName:string;appName:string}
export type StorageLike={getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void;removeItem:(key:string)=>void}

function browserStorage():StorageLike|null{
  if(typeof window==='undefined')return null
  return window.localStorage
}

function validSession(value:unknown):value is DeviceSession{
  if(!value||typeof value!=='object')return false
  const session=value as Partial<DeviceSession>
  return typeof session.token==='string'&&Boolean(session.token)&&typeof session.storeName==='string'&&typeof session.appName==='string'
}

export function loadDeviceSession(storage?:StorageLike|null){
  const source=storage===undefined?browserStorage():storage
  if(!source)return null
  try{
    const raw=source.getItem(DEVICE_SESSION_KEY)
    if(!raw)return null
    const value=JSON.parse(raw) as unknown
    return validSession(value)?value:null
  }catch{return null}
}

export function saveDeviceSession(session:DeviceSession,storage?:StorageLike|null){
  const source=storage===undefined?browserStorage():storage
  if(!source)return
  source.setItem(DEVICE_SESSION_KEY,JSON.stringify(session))
}

export function clearDeviceSession(storage?:StorageLike|null){
  const source=storage===undefined?browserStorage():storage
  source?.removeItem(DEVICE_SESSION_KEY)
}

export function getDeviceId(storage?:StorageLike|null){
  const source=storage===undefined?browserStorage():storage
  if(!source)return ''
  const existing=source.getItem(DEVICE_ID_KEY)
  if(existing)return existing
  const generated=typeof globalThis.crypto?.randomUUID==='function'
    ?globalThis.crypto.randomUUID()
    :`device-${Date.now()}-${Math.random().toString(36).slice(2)}`
  source.setItem(DEVICE_ID_KEY,generated)
  return generated
}

export function tenantHeaders(headers:Record<string,string>={},token=loadDeviceSession()?.token){
  return token?{...headers,'x-loop-tenant-token':token}:{...headers}
}
