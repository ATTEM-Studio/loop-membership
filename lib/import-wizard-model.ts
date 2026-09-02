import {buildExternalIdPhoneMap,inferColumnTarget,normalizeRowsForRole} from './import-normalize'
import type {ParsedWorkbook,ParsedWorkbookSheet} from './import-workbook'
import type {
  DuplicateField,
  DuplicateResolution,
  ImportBalanceTarget,
  ImportField,
  ImportSheetMapping,
  NormalizedImportPayload,
} from './import-types'

const BALANCE_FIELDS=new Set<ImportField>(['balance','visitPoints','stamps','paymentPoints','delta','remainingBalance'])

function initialConfig(sheet:ParsedWorkbookSheet):ImportSheetMapping{
  const role=sheet.inferredRole
  const mappings:Partial<Record<ImportField,string>>={}
  const balanceTargets:Record<string,ImportBalanceTarget>={}
  if(role!=='ignore'){
    for(const header of sheet.headers){
      const field=inferColumnTarget(header,role)
      if(!field||mappings[field])continue
      mappings[field]=header
      if(BALANCE_FIELDS.has(field)){
        if(field==='stamps')balanceTargets[header]='stamps'
        else if(field==='paymentPoints')balanceTargets[header]='paymentPoints'
        else balanceTargets[header]='visitPoints'
      }
    }
  }
  return {sheetName:sheet.name,role,mappings,balanceTargets}
}

export function createInitialSheetConfigs(workbook:ParsedWorkbook){
  return workbook.sheets.map(initialConfig)
}

function sheetByName(workbook:ParsedWorkbook,name:string){return workbook.sheets.find(sheet=>sheet.name===name)}

export function buildNormalizedImportPayload(workbook:ParsedWorkbook,configs:ImportSheetMapping[],sourceFileHash?:string):NormalizedImportPayload{
  const customers=[] as NormalizedImportPayload['customers']
  const visits=[] as NormalizedImportPayload['visits']
  const pointHistory=[] as NormalizedImportPayload['pointHistory']
  const issues=[] as NormalizedImportPayload['issues']
  const unsupportedColumns=[] as NormalizedImportPayload['unsupportedColumns']

  // Customer sheets are normalized first because history sheets may only contain an external member ID.
  for(const config of configs.filter(config=>config.role==='customers')){
    const sheet=sheetByName(workbook,config.sheetName);if(!sheet)continue
    const result=normalizeRowsForRole({
      sheetName:sheet.name,role:config.role,headers:sheet.headers,rows:sheet.rows,mappings:config.mappings,
      balanceTargets:config.balanceTargets,externalIdToPhone:new Map(),
    })
    customers.push(...result.customers);issues.push(...result.issues)
    if(result.unsupportedColumns.length)unsupportedColumns.push({sheetName:sheet.name,columns:result.unsupportedColumns})
  }

  const externalIdToPhone=buildExternalIdPhoneMap(customers)
  for(const config of configs.filter(config=>config.role==='visits'||config.role==='points')){
    const sheet=sheetByName(workbook,config.sheetName);if(!sheet)continue
    const result=normalizeRowsForRole({
      sheetName:sheet.name,role:config.role,headers:sheet.headers,rows:sheet.rows,mappings:config.mappings,
      balanceTargets:config.balanceTargets,externalIdToPhone,
    })
    visits.push(...result.visits);pointHistory.push(...result.points);issues.push(...result.issues)
    if(result.unsupportedColumns.length)unsupportedColumns.push({sheetName:sheet.name,columns:result.unsupportedColumns})
  }

  for(const config of configs.filter(config=>config.role==='ignore')){
    const sheet=sheetByName(workbook,config.sheetName)
    if(sheet?.headers.length)unsupportedColumns.push({sheetName:sheet.name,columns:sheet.headers.filter(Boolean)})
  }

  return {fileName:workbook.fileName,sourceFileHash,customers,visits,pointHistory,issues,unsupportedColumns}
}

type DuplicateForReadiness={phone:string;imported:Partial<Record<DuplicateField,unknown>>}

export function duplicateDecisionsComplete(duplicates:DuplicateForReadiness[],resolutions:DuplicateResolution[]){
  const byPhone=new Map(resolutions.map(resolution=>[resolution.phone,resolution]))
  return duplicates.every(duplicate=>{
    const resolution=byPhone.get(duplicate.phone)
    if(!resolution)return false
    if(resolution.strategy!=='manual')return true
    return (Object.keys(duplicate.imported) as DuplicateField[])
      .filter(field=>duplicate.imported[field]!==undefined)
      .every(field=>Boolean(resolution.fields?.[field]))
  })
}

export function setSourceColumnMapping(config:ImportSheetMapping,header:string,target:ImportField|'ignore',balanceTarget?:ImportBalanceTarget):ImportSheetMapping{
  const mappings={...config.mappings}
  for(const [field,mappedHeader] of Object.entries(mappings))if(mappedHeader===header)delete mappings[field as ImportField]
  const balanceTargets={...config.balanceTargets}
  delete balanceTargets[header]
  if(target!=='ignore'){
    mappings[target]=header
    if(BALANCE_FIELDS.has(target))balanceTargets[header]=balanceTarget??(target==='stamps'?'stamps':target==='paymentPoints'?'paymentPoints':'visitPoints')
  }
  return {...config,mappings,balanceTargets}
}
