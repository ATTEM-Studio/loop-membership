import * as XLSX from 'xlsx'
import {inferColumnTarget,inferSheetRole} from './import-normalize'
import type {ImportSheetRole} from './import-types'

export type ParsedWorkbookSheet={
  name:string
  headerRowNumber:number
  headers:string[]
  rows:unknown[][]
  rowCount:number
  inferredRole:ImportSheetRole
}

export type ParsedWorkbook={
  fileName:string
  sheets:ParsedWorkbookSheet[]
  totalRows:number
}

function nonEmptyCell(value:unknown){return String(value??'').trim()!==''}
function nonEmptyRow(row:unknown[]){return row.some(nonEmptyCell)}

function headerScore(row:unknown[]){
  return row.reduce<number>((score,value)=>{
    const header=String(value??'').trim()
    if(!header)return score
    const recognized=['customers','visits','points'].some(role=>Boolean(inferColumnTarget(header,role as ImportSheetRole)))
    return score+(recognized?1:0)
  },0)
}

function detectHeaderIndex(rows:unknown[][]){
  const candidates=rows.slice(0,10).map((row,index)=>({index,score:headerScore(row),cells:row.filter(nonEmptyCell).length}))
  const best=candidates.sort((a,b)=>b.score-a.score||b.cells-a.cells||a.index-b.index)[0]
  if(best&&best.score>=2)return best.index
  const firstNonEmpty=rows.findIndex(nonEmptyRow)
  return firstNonEmpty>=0?firstNonEmpty:0
}

export function parseWorkbookBytes(bytes:ArrayBuffer|Uint8Array,fileName:string):ParsedWorkbook{
  const workbook=XLSX.read(bytes,{type:'array',cellDates:false})
  const sheets=workbook.SheetNames.map(name=>{
    const worksheet=workbook.Sheets[name]
    const matrix=XLSX.utils.sheet_to_json<unknown[]>(worksheet,{header:1,raw:true,defval:'',blankrows:true})
      .map(row=>Array.isArray(row)?row:[])
    const headerIndex=detectHeaderIndex(matrix)
    const headers=(matrix[headerIndex]??[]).map(value=>String(value??'').trim())
    const rows=matrix.slice(headerIndex+1).filter(nonEmptyRow)
    return {
      name,
      headerRowNumber:headerIndex+1,
      headers,
      rows,
      rowCount:rows.length,
      inferredRole:inferSheetRole(name,headers),
    }
  })
  return {fileName,sheets,totalRows:sheets.reduce((sum,sheet)=>sum+sheet.rowCount,0)}
}
