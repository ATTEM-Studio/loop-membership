import {describe,expect,it} from 'vitest'
import {clearDeviceSession,loadDeviceSession,saveDeviceSession,tenantHeaders} from './device-client'

function storage(){
  const values=new Map<string,string>()
  return {
    getItem:(key:string)=>values.get(key)??null,
    setItem:(key:string,value:string)=>{values.set(key,value)},
    removeItem:(key:string)=>{values.delete(key)},
  }
}

describe('device tenant session',()=>{
  it('persists and restores the tenant session',()=>{
    const store=storage()
    const session={token:'signed-token',storeName:'꿈카페',appName:'꿈카페 멤버십'}
    saveDeviceSession(session,store)
    expect(loadDeviceSession(store)).toEqual(session)
  })

  it('clears the tenant session without touching other storage',()=>{
    const store=storage()
    saveDeviceSession({token:'signed-token',storeName:'꿈카페',appName:'꿈카페 멤버십'},store)
    clearDeviceSession(store)
    expect(loadDeviceSession(store)).toBeNull()
  })

  it('adds the saved tenant token to API headers',()=>{
    const store=storage()
    saveDeviceSession({token:'signed-token',storeName:'꿈카페',appName:'꿈카페 멤버십'},store)
    expect(tenantHeaders({'Content-Type':'application/json'},loadDeviceSession(store)?.token)).toEqual({
      'Content-Type':'application/json','x-loop-tenant-token':'signed-token',
    })
  })
})
