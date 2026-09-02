import {google,type sheets_v4} from 'googleapis'
import type {ImportPlan} from './import-merge'
import {
  SHEET_LAYOUT,
  type SheetContext,
  balanceLedgerToRow,
  customerToRow,
  ensureHeaders,
  paymentLedgerToRow,
  readPaymentLedger,
  readPointLedger,
  readStampLedger,
  readTransactions,
  readVisits,
  replaceCustomers,
  transactionToRow,
} from './sheets'

export const IMPORT_METADATA_KEY='LOOP_IMPORT_HASH'

export function importMetadataRequest(hash:string):sheets_v4.Schema$Request{
  return {createDeveloperMetadata:{developerMetadata:{metadataKey:IMPORT_METADATA_KEY,metadataValue:hash,location:{spreadsheet:true},visibility:'DOCUMENT'}}}
}

export function importRowsForPlan(plan:ImportPlan){
  return [
    {key:'customers' as const,rows:plan.customers.map(customerToRow)},
    {key:'visits' as const,rows:plan.visits.map(visit=>[visit.date,visit.phone,visit.source??'',visit.points])},
    {key:'transactions' as const,rows:plan.transactions.map(transactionToRow)},
    {key:'pointLedger' as const,rows:plan.pointLedger.map(balanceLedgerToRow)},
    {key:'stampLedger' as const,rows:plan.stampLedger.map(balanceLedgerToRow)},
    {key:'paymentLedger' as const,rows:plan.paymentLedger.map(paymentLedgerToRow)},
  ]
}

type ImportRowKey=ReturnType<typeof importRowsForPlan>[number]['key']

function client(context?:SheetContext){
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')
  if(!email||!key||!(context?.spreadsheetId||process.env.GOOGLE_SHEET_ID))return null
  const auth=new google.auth.JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']})
  return google.sheets({version:'v4',auth})
}

function requiredClient(context?:SheetContext){const sheets=client(context);if(!sheets)throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');return sheets}
function spreadsheetId(context?:SheetContext){const id=context?.spreadsheetId?.trim()||process.env.GOOGLE_SHEET_ID?.trim();if(!id)throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');return id}

const specByKey=Object.fromEntries(SHEET_LAYOUT.map(spec=>[spec.key,spec])) as Record<string,(typeof SHEET_LAYOUT)[number]>
const columnByKey:Record<ImportRowKey,string>={customers:'J',visits:'D',transactions:'G',pointLedger:'F',stampLedger:'F',paymentLedger:'H'}

export async function hasImportPayloadHash(hash:string,context?:SheetContext){
  const sheets=requiredClient(context)
  const response=await sheets.spreadsheets.developerMetadata.search({
    spreadsheetId:spreadsheetId(context),
    requestBody:{dataFilters:[{developerMetadataLookup:{metadataKey:IMPORT_METADATA_KEY,metadataValue:hash,locationType:'SPREADSHEET'}}]},
  })
  return Boolean(response.data.matchedDeveloperMetadata?.length)
}

function rowKey(row:unknown[]){return JSON.stringify(row.map(value=>value??''))}
function missingRows(existing:unknown[][],wanted:unknown[][]){
  const counts=new Map<string,number>()
  for(const row of existing)counts.set(rowKey(row),(counts.get(rowKey(row))??0)+1)
  const missing:unknown[][]=[]
  for(const row of wanted){
    const key=rowKey(row),available=counts.get(key)??0
    if(available>0)counts.set(key,available-1);else missing.push(row)
  }
  return missing
}

async function currentRowsForKey(key:Exclude<ImportRowKey,'customers'>,context?:SheetContext){
  if(key==='visits')return (await readVisits(context)).map(visit=>[visit.date,visit.phone,visit.source??'',visit.points])
  if(key==='transactions')return (await readTransactions(context)).map(transactionToRow)
  if(key==='pointLedger')return (await readPointLedger(context)).map(balanceLedgerToRow)
  if(key==='stampLedger')return (await readStampLedger(context)).map(balanceLedgerToRow)
  return (await readPaymentLedger(context)).map(paymentLedgerToRow)
}

async function appendRows(sheets:sheets_v4.Sheets,key:Exclude<ImportRowKey,'customers'>,rows:unknown[][],context?:SheetContext){
  if(!rows.length)return
  const spec=specByKey[key]
  await sheets.spreadsheets.values.append({
    spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:${columnByKey[key]}`,
    valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rows},
  })
}

export async function applyImportPlan(plan:ImportPlan,hash:string,importId:string,context?:SheetContext){
  if(await hasImportPayloadHash(hash,context))throw new Error('IMPORT_ALREADY_APPLIED')
  if(plan.blockingIssues.length)throw new Error('IMPORT_HAS_BLOCKING_ISSUES')
  await ensureHeaders(context)
  const sheets=requiredClient(context)
  const rowsByKey=importRowsForPlan(plan)

  // Histories are appended before the customer snapshot. Retries filter exact rows; generated
  // point rows include importId in their description, while visit rows use multiset matching.
  for(const item of rowsByKey){
    if(item.key==='customers')continue
    const existing=await currentRowsForKey(item.key,context)
    await appendRows(sheets,item.key,missingRows(existing,item.rows),context)
  }

  // The customer list is a target snapshot, so rerunning a partially completed import is idempotent.
  await replaceCustomers(plan.customers,context)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId:spreadsheetId(context),requestBody:{requests:[importMetadataRequest(hash)]},
  })
  return {importId,summary:plan.summary}
}
