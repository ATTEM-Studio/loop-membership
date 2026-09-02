import {describe,expect,it} from 'vitest'
import type {Customer} from './domain'
import type {NormalizedImportPayload,DuplicateResolution} from './import-types'
import {planImport} from './import-merge'

const existing:Customer={
  id:'existing-1',phone:'01012345678',source:'네이버',visits:3,points:5,stamps:1,paymentPoints:0,lastVisit:'2026-08-01',
  privacyConsentAt:'2026-09-01T00:00:00.000Z',privacyConsentVersion:'2026-09-01-v1',
}

function payload(overrides:Partial<NormalizedImportPayload>={}):NormalizedImportPayload{
  return {
    fileName:'legacy.xlsx',customers:[],visits:[],pointHistory:[],issues:[],unsupportedColumns:[],...overrides,
  }
}

describe('duplicate customer merge policy',()=>{
  it('uses imported balance without automatically summing it with LOOP balance',()=>{
    const input=payload({customers:[{sheetName:'회원목록',rowNumber:2,phone:existing.phone,visits:12,visitPoints:8,lastVisit:'2026-08-20'}]})
    const resolutions:DuplicateResolution[]=[{phone:existing.phone,strategy:'use-imported'}]
    const plan=planImport([existing],input,resolutions,'2026-09-02T04:00:00.000Z','imp-123')
    const customer=plan.customers.find(item=>item.phone===existing.phone)!
    expect(customer.points).toBe(8)
    expect(customer.points).not.toBe(13)
    expect(customer.visits).toBe(12)
  })

  it('keeps the existing LOOP customer untouched when keep-existing is selected',()=>{
    const input=payload({customers:[{sheetName:'회원목록',rowNumber:2,phone:existing.phone,visits:12,visitPoints:8,lastVisit:'2026-08-20'}]})
    const plan=planImport([existing],input,[{phone:existing.phone,strategy:'keep-existing'}],'2026-09-02T04:00:00.000Z','imp-123')
    expect(plan.customers.find(item=>item.phone===existing.phone)).toEqual(existing)
    expect(plan.transactions).toHaveLength(0)
  })

  it('supports field-by-field manual conflict choices',()=>{
    const input=payload({customers:[{sheetName:'회원목록',rowNumber:2,phone:existing.phone,visits:12,visitPoints:8,stamps:4,lastVisit:'2026-08-20'}]})
    const plan=planImport([existing],input,[{
      phone:existing.phone,strategy:'manual',fields:{visits:'imported',visitPoints:'existing',stamps:'imported',lastVisit:'imported',source:'existing',paymentPoints:'existing'},
    }],'2026-09-02T04:00:00.000Z','imp-123')
    const customer=plan.customers.find(item=>item.phone===existing.phone)!
    expect(customer.visits).toBe(12)
    expect(customer.points).toBe(5)
    expect(customer.stamps).toBe(4)
    expect(customer.lastVisit).toBe('2026-08-20')
    expect(customer.source).toBe('네이버')
  })
})

describe('new imported customers and history',()=>{
  it('preserves summary visit count without fabricating historical visit rows',()=>{
    const input=payload({customers:[{sheetName:'회원목록',rowNumber:2,phone:'01055556666',visits:12,visitPoints:8,lastVisit:'2026-08-20'}]})
    const plan=planImport([],input,[],'2026-09-02T04:00:00.000Z','imp-123')
    expect(plan.customers[0].visits).toBe(12)
    expect(plan.visits).toHaveLength(0)
  })

  it('creates explicit baseline records for summary-only visit points',()=>{
    const input=payload({customers:[{sheetName:'회원목록',rowNumber:2,phone:'01055556666',visits:12,visitPoints:8}]})
    const plan=planImport([],input,[],'2026-09-02T04:00:00.000Z','imp-123')
    expect(plan.transactions).toEqual([
      expect.objectContaining({phone:'01055556666',type:'ADJUST',delta:8,balanceBefore:0,balanceAfter:8,description:expect.stringContaining('기존 시스템 DB 이전')}),
    ])
    expect(plan.pointLedger).toEqual([
      expect.objectContaining({phone:'01055556666',delta:8,balanceBefore:0,balanceAfter:8,description:expect.stringContaining('imp-123')}),
    ])
  })

  it('keeps LOOP privacy consent blank for imported customers',()=>{
    const input=payload({customers:[{sheetName:'회원목록',rowNumber:2,phone:'01055556666',visits:2,visitPoints:3}]})
    const plan=planImport([],input,[],'2026-09-02T04:00:00.000Z','imp-123')
    expect(plan.customers[0].privacyConsentAt).toBeUndefined()
    expect(plan.customers[0].privacyConsentVersion).toBeUndefined()
  })

  it('preserves real visit dates when history is provided',()=>{
    const input=payload({
      customers:[{sheetName:'회원목록',rowNumber:2,phone:'01055556666',visits:2}],
      visits:[
        {sheetName:'이용내역',rowNumber:2,phone:'01055556666',date:'2026-08-10',paymentAmount:12000},
        {sheetName:'이용내역',rowNumber:3,phone:'01055556666',date:'2026-08-20',paymentAmount:9000},
      ],
    })
    const plan=planImport([],input,[],'2026-09-02T04:00:00.000Z','imp-123')
    expect(plan.visits.map(item=>item.date)).toEqual(['2026-08-10','2026-08-20'])
  })
})
