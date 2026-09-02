import {describe,expect,it} from 'vitest'
import {
  buildExternalIdPhoneMap,
  inferColumnTarget,
  inferSheetRole,
  normalizeLegacyDate,
  normalizeLegacyPhone,
  normalizeRowsForRole,
} from './import-normalize'

describe('legacy workbook inference',()=>{
  it('recognizes common customer column aliases',()=>{
    expect(inferColumnTarget('휴대폰번호','customers')).toBe('phone')
    expect(inferColumnTarget('총 방문수','customers')).toBe('visits')
    expect(inferColumnTarget('잔여포인트','customers')).toBe('balance')
    expect(inferColumnTarget('마지막방문','customers')).toBe('lastVisit')
    expect(inferColumnTarget('회원번호','customers')).toBe('externalId')
  })

  it('infers customer, visit, point, and ignored sheet roles',()=>{
    expect(inferSheetRole('회원목록',['회원번호','휴대폰','잔여P'])).toBe('customers')
    expect(inferSheetRole('이용내역',['회원번호','이용일','결제금액'])).toBe('visits')
    expect(inferSheetRole('적립내역',['회원번호','적립일','적립','사용'])).toBe('points')
    expect(inferSheetRole('안내',['설명','비고'])).toBe('ignore')
  })
})

describe('legacy value normalization',()=>{
  it('normalizes Korean mobile numbers without inventing digits',()=>{
    expect(normalizeLegacyPhone('010-1234-5678')).toBe('01012345678')
    expect(normalizeLegacyPhone('010 9876 5432')).toBe('01098765432')
    expect(normalizeLegacyPhone('02-123-4567')).toBeUndefined()
  })

  it('normalizes spreadsheet dates and rejects invalid dates',()=>{
    expect(normalizeLegacyDate('2026.08.20')).toBe('2026-08-20')
    expect(normalizeLegacyDate('2026/08/21')).toBe('2026-08-21')
    expect(normalizeLegacyDate(46254)).toBe('2026-08-20')
    expect(normalizeLegacyDate('날짜없음')).toBeUndefined()
  })
})

describe('external member id joins',()=>{
  it('resolves visit rows that only contain external member ids',()=>{
    const customers=[
      {sheetName:'회원목록',rowNumber:2,externalId:'A-100',phone:'01012345678'},
      {sheetName:'회원목록',rowNumber:3,externalId:'A-200',phone:'01099998888'},
    ]
    const map=buildExternalIdPhoneMap(customers)
    expect(map.get('A-100')).toBe('01012345678')

    const result=normalizeRowsForRole({
      sheetName:'이용내역',
      role:'visits',
      headers:['회원번호','이용일','결제금액'],
      rows:[['A-100','2026-08-20',12000],['UNKNOWN','2026-08-21',9000]],
      mappings:{externalId:'회원번호',date:'이용일',paymentAmount:'결제금액'},
      externalIdToPhone:map,
      balanceTargets:{},
    })

    expect(result.visits).toEqual([
      {sheetName:'이용내역',rowNumber:2,phone:'01012345678',date:'2026-08-20',paymentAmount:12000},
    ])
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({sheetName:'이용내역',rowNumber:3,code:'PHONE_UNRESOLVED'}),
    ]))
  })

  it('reports unsupported columns instead of silently discarding them',()=>{
    const result=normalizeRowsForRole({
      sheetName:'회원목록',
      role:'customers',
      headers:['휴대폰','이름','이메일','방문수'],
      rows:[['010-1234-5678','홍길동','test@example.com',3]],
      mappings:{phone:'휴대폰',visits:'방문수'},
      externalIdToPhone:new Map(),
      balanceTargets:{},
    })
    expect(result.unsupportedColumns).toEqual(['이름','이메일'])
  })
})
