import {describe,expect,it} from 'vitest'
import {buildLoopManifest,shouldCacheLoopRequest} from './pwa'

describe('buildLoopManifest',()=>{
  it('contains the Chromium installability fields',()=>{
    const manifest=buildLoopManifest()
    expect(manifest.name).toBe('LOOP — 매장 멤버십')
    expect(manifest.short_name).toBe('LOOP')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.theme_color).toBe('#F3F5F8')
    expect(manifest.background_color).toBe('#F3F5F8')
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({src:'/pwa-icon/192',sizes:'192x192',type:'image/png'}),
      expect.objectContaining({src:'/pwa-icon/512',sizes:'512x512',type:'image/png'}),
      expect.objectContaining({src:'/pwa-icon/512?purpose=maskable',purpose:'maskable'}),
    ]))
  })
})

describe('shouldCacheLoopRequest',()=>{
  it('only caches same-app static GET assets by pathname policy',()=>{
    expect(shouldCacheLoopRequest('GET','/_next/static/chunks/app.js')).toBe(true)
    expect(shouldCacheLoopRequest('GET','/pwa-icon/192')).toBe(true)
    expect(shouldCacheLoopRequest('GET','/api/members')).toBe(false)
    expect(shouldCacheLoopRequest('POST','/api/members')).toBe(false)
    expect(shouldCacheLoopRequest('GET','/')).toBe(false)
  })
})
