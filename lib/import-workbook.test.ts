import {describe,expect,it} from 'vitest'
import * as XLSX from 'xlsx'
import {parseWorkbookBytes} from './import-workbook'

describe('workbook parsing',()=>{
  it('reads every worksheet and keeps its own headers and rows',()=>{
    const workbook=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
      ['회원번호','휴대폰','잔여P'],
      ['A-1','010-1234-5678',8],
    ]),'회원목록')
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
      ['회원번호','이용일','결제금액'],
      ['A-1','2026-08-20',12000],
    ]),'이용내역')
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
      ['설명'],['이 파일은 테스트입니다'],
    ]),'안내')
    const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'}) as ArrayBuffer
    const parsed=parseWorkbookBytes(bytes,'legacy.xlsx')

    expect(parsed.sheets.map(sheet=>sheet.name)).toEqual(['회원목록','이용내역','안내'])
    expect(parsed.sheets[0]).toEqual(expect.objectContaining({headers:['회원번호','휴대폰','잔여P'],rowCount:1,inferredRole:'customers'}))
    expect(parsed.sheets[1]).toEqual(expect.objectContaining({headers:['회원번호','이용일','결제금액'],rowCount:1,inferredRole:'visits'}))
    expect(parsed.sheets[2].inferredRole).toBe('ignore')
  })

  it('detects a header row even when a title row appears first',()=>{
    const workbook=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
      ['2026 고객 데이터'],
      [],
      ['회원번호','휴대폰','방문횟수','포인트'],
      ['A-1','010-1234-5678',4,9],
    ]),'고객DB')
    const bytes=XLSX.write(workbook,{type:'array',bookType:'xlsx'}) as ArrayBuffer
    const parsed=parseWorkbookBytes(bytes,'legacy.xlsx')
    expect(parsed.sheets[0].headerRowNumber).toBe(3)
    expect(parsed.sheets[0].headers).toEqual(['회원번호','휴대폰','방문횟수','포인트'])
    expect(parsed.sheets[0].rows).toEqual([['A-1','010-1234-5678',4,9]])
  })
})
