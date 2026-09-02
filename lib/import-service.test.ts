import {describe,expect,it} from 'vitest'
import type {Customer} from './domain'
import type {DuplicateResolution,NormalizedImportPayload} from './import-types'
import {buildImportPreview,stableImportHash,validateImportCommit} from './import-service'

const current:Customer[]=[{id:'c1',phone:'01012345678',source:'네이버',visits:3,points:5,stamps:1,paymentPoints:0,lastVisit:'2026-08-01'}]
const payload:NormalizedImportPayload={
  fileName:'legacy.xlsx',
  customers:[
    {sheetName:'회원목록',rowNumber:2,phone:'01012345678',visits:12,visitPoints:8,lastVisit:'2026-08-20'},
    {sheetName:'회원목록',rowNumber:3,phone:'01055556666',visits:2,visitPoints:3},
  ],
  visits:[],pointHistory:[],issues:[],unsupportedColumns:[],
}

describe('import preview',()=>{
  it('separates new and duplicate customers and masks current LOOP phones',()=>{
    const preview=buildImportPreview(current,payload)
    expect(preview.newCustomers).toBe(1)
    expect(preview.duplicates).toHaveLength(1)
    expect(preview.duplicates[0]).toEqual(expect.objectContaining({
      phone:'01012345678',phoneMasked:'010-1234-****',
      current:expect.objectContaining({visits:3,visitPoints:5,stamps:1}),
      imported:expect.objectContaining({visits:12,visitPoints:8}),
    }))
  })
})

describe('commit validation',()=>{
  const resolution:DuplicateResolution={phone:'01012345678',strategy:'use-imported'}

  it('requires the final acknowledgement',()=>{
    expect(()=>validateImportCommit(current,payload,[resolution],false)).toThrow('IMPORT_CONFIRM_REQUIRED')
  })

  it('requires a decision for every duplicate customer',()=>{
    expect(()=>validateImportCommit(current,payload,[],true)).toThrow('DUPLICATE_RESOLUTION_REQUIRED')
  })

  it('rejects server-side negative balances even if browser normalization was bypassed',()=>{
    const unsafe={...payload,customers:[{...payload.customers[1],visitPoints:-1}]}
    expect(()=>validateImportCommit([],unsafe,[],true)).toThrow('INVALID_IMPORT_BALANCE')
  })

  it('accepts an acknowledged import with all duplicate decisions',()=>{
    expect(validateImportCommit(current,payload,[resolution],true)).toEqual({ok:true})
  })
})

describe('normalized import fingerprint',()=>{
  it('is deterministic for equivalent payload and conflict decisions',()=>{
    const resolutions:DuplicateResolution[]=[{phone:'01012345678',strategy:'use-imported'}]
    const a=stableImportHash(payload,resolutions)
    const b=stableImportHash({...payload,unsupportedColumns:[]},resolutions)
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not change when the same normalized data is renamed or has a different source file hash',()=>{
    const resolutions:DuplicateResolution[]=[{phone:'01012345678',strategy:'use-imported'}]
    const a=stableImportHash({...payload,sourceFileHash:'aaa'},resolutions)
    const b=stableImportHash({...payload,fileName:'renamed-copy.xlsx',sourceFileHash:'bbb'},resolutions)
    expect(a).toBe(b)
  })
})
