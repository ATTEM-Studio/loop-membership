import {describe,expect,it} from 'vitest'
import {createTenantToken,extractSpreadsheetId,verifyTenantToken} from './tenant-auth'

const secret='test-loop-auth-secret'
const payload={spreadsheetId:'sheet_abc-123',deviceId:'device-001',issuedAt:1700000000000,version:1 as const}

describe('tenant authentication',()=>{
  it('round-trips a signed tenant token',()=>{
    const token=createTenantToken(payload,secret)
    expect(verifyTenantToken(token,secret)).toEqual(payload)
  })

  it('rejects a token whose signature was changed',()=>{
    const token=createTenantToken(payload,secret)
    const tampered=token.slice(0,-1)+(token.endsWith('a')?'b':'a')
    expect(()=>verifyTenantToken(tampered,secret)).toThrow('INVALID_TENANT_TOKEN')
  })

  it('rejects a token signed with another secret',()=>{
    const token=createTenantToken(payload,secret)
    expect(()=>verifyTenantToken(token,'another-secret')).toThrow('INVALID_TENANT_TOKEN')
  })

  it('extracts a spreadsheet id from a Google Sheets URL or raw id',()=>{
    expect(extractSpreadsheetId('https://docs.google.com/spreadsheets/d/sheet_abc-123/edit#gid=0')).toBe('sheet_abc-123')
    expect(extractSpreadsheetId('sheet_abc-123')).toBe('sheet_abc-123')
  })

  it('rejects an invalid spreadsheet reference',()=>{
    expect(()=>extractSpreadsheetId('https://example.com/not-a-sheet')).toThrow('INVALID_SPREADSHEET_ID')
  })
})
