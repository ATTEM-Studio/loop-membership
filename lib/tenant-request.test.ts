import {describe,expect,it} from 'vitest'
import {createTenantToken} from './tenant-auth'
import {getTenantContext} from './tenant-request'

describe('tenant request context',()=>{
  it('returns no override when a request has no tenant token',()=>{
    expect(getTenantContext(new Request('https://loop.test/api/members'))).toBeUndefined()
  })

  it('resolves the spreadsheet from a bearer tenant token',()=>{
    const previous=process.env.LOOP_AUTH_SECRET
    process.env.LOOP_AUTH_SECRET='request-test-secret'
    const token=createTenantToken({spreadsheetId:'sheet-tenant-a',deviceId:'device-a',issuedAt:1700000000000,version:1},process.env.LOOP_AUTH_SECRET)
    const context=getTenantContext(new Request('https://loop.test/api/members',{headers:{authorization:`Bearer ${token}`}}))
    expect(context).toEqual({spreadsheetId:'sheet-tenant-a'})
    if(previous===undefined)delete process.env.LOOP_AUTH_SECRET
    else process.env.LOOP_AUTH_SECRET=previous
  })

  it('rejects an invalid tenant token before a sheet context is created',()=>{
    const previous=process.env.LOOP_AUTH_SECRET
    process.env.LOOP_AUTH_SECRET='request-test-secret'
    expect(()=>getTenantContext(new Request('https://loop.test/api/members',{headers:{'x-loop-tenant-token':'broken'}}))).toThrow('INVALID_TENANT_TOKEN')
    if(previous===undefined)delete process.env.LOOP_AUTH_SECRET
    else process.env.LOOP_AUTH_SECRET=previous
  })
})
