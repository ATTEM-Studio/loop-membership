import {describe,expect,it} from 'vitest'
import type {ParsedWorkbook} from './import-workbook'
import {buildNormalizedImportPayload,createInitialSheetConfigs,duplicateDecisionsComplete} from './import-wizard-model'

const workbook:ParsedWorkbook={
  fileName:'legacy.xlsx',totalRows:4,sheets:[
    {name:'회원목록',headerRowNumber:1,headers:['회원번호','휴대폰','방문횟수','포인트','이름'],rows:[['A1','010-1234-5678',3,8,'홍길동']],rowCount:1,inferredRole:'customers'},
    {name:'이용내역',headerRowNumber:1,headers:['회원번호','이용일','결제금액'],rows:[['A1','2026-08-20',12000]],rowCount:1,inferredRole:'visits'},
    {name:'적립내역',headerRowNumber:1,headers:['회원번호','적립일','적립'],rows:[['A1','2026-08-20',2]],rowCount:1,inferredRole:'points'},
    {name:'안내',headerRowNumber:1,headers:['설명'],rows:[['안내문']],rowCount:1,inferredRole:'ignore'},
  ],
}

describe('wizard initial mapping',()=>{
  it('keeps every worksheet and preselects inferred roles and mappings',()=>{
    const configs=createInitialSheetConfigs(workbook)
    expect(configs.map(config=>[config.sheetName,config.role])).toEqual([
      ['회원목록','customers'],['이용내역','visits'],['적립내역','points'],['안내','ignore'],
    ])
    expect(configs[0].mappings).toEqual(expect.objectContaining({externalId:'회원번호',phone:'휴대폰',visits:'방문횟수',balance:'포인트'}))
    expect(configs[0].balanceTargets['포인트']).toBe('visitPoints')
    expect(configs[2].balanceTargets['적립']).toBe('visitPoints')
  })
})

describe('wizard normalized payload',()=>{
  it('joins member-id-only history rows to the customer phone and reports unused columns',()=>{
    const configs=createInitialSheetConfigs(workbook)
    const payload=buildNormalizedImportPayload(workbook,configs,'file-sha')
    expect(payload.customers[0]).toEqual(expect.objectContaining({phone:'01012345678',visits:3,visitPoints:8}))
    expect(payload.visits[0]).toEqual(expect.objectContaining({phone:'01012345678',date:'2026-08-20',paymentAmount:12000}))
    expect(payload.pointHistory[0]).toEqual(expect.objectContaining({phone:'01012345678',date:'2026-08-20',delta:2,target:'visitPoints'}))
    expect(payload.unsupportedColumns).toEqual(expect.arrayContaining([expect.objectContaining({sheetName:'회원목록',columns:['이름']})]))
  })
})

describe('duplicate decision readiness',()=>{
  it('requires a strategy for every duplicate and required manual fields',()=>{
    const duplicates=[{phone:'01012345678',imported:{visits:3,visitPoints:8,stamps:undefined,paymentPoints:undefined,lastVisit:undefined,source:undefined}}]
    expect(duplicateDecisionsComplete(duplicates,[])).toBe(false)
    expect(duplicateDecisionsComplete(duplicates,[{phone:'01012345678',strategy:'use-imported'}])).toBe(true)
    expect(duplicateDecisionsComplete(duplicates,[{phone:'01012345678',strategy:'manual',fields:{visits:'imported'}}])).toBe(false)
    expect(duplicateDecisionsComplete(duplicates,[{phone:'01012345678',strategy:'manual',fields:{visits:'imported',visitPoints:'existing'}}])).toBe(true)
  })
})
