import {google,type sheets_v4} from 'googleapis'
import type {ImportPlan} from './import-merge'
import {
  SHEET_LAYOUT,
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

function client(){
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')
  if(!email||!key||!process.env.GOOGLE_SHEET_ID)return null
  const auth=new google.auth.JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']})
  return google.sheets({version:'v4',auth})
}

function requiredClient(){const sheets=client();if(!sheets)throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED');return sheets}

const specByKey=Object.fromEntries(SHEET_LAYOUT.map(spec=>[spec.key,spec])) as Record<string,(typeof SHEET_LAYOUT)[number]>
const columnByKey:Record<ImportRowKey,string>={customers:'J',visits:'D',transactions:'G',pointLedger:'F',stampLedger:'F',paymentLedger:'H'}

export async function hasImportPayloadHash(hash:string){
  const sheets=requiredClient()
  const response=await sheets.spreadsheets.developerMetadata.search({
    spreadsheetId:process.env.GOOGLE_SHEET_ID!,
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

async function currentRowsForKey(key:Exclude<ImportRowKey,'customers'>){
  if(key==='visits')return (await readVisits()).map(visit=>[visit.date,visit.phone,visit.source??'',visit.points])
  if(key==='transactions')return (await readTransactions()).map(transactionToRow)
  if(key==='pointLedger')return (await readPointLedger()).map(balanceLedgerToRow)
  if(key==='stampLedger')return (await readStampLedger()).map(balanceLedgerToRow)
  return (await readPaymentLedger()).map(paymentLedgerToRow)
}

async function appendRows(sheets:sheets_v4.Sheets,key:Exclude<ImportRowKey,'customers'>,rows:unknown[][]){
  if(!rows.length)return
  const spec=specByKey[key]
  await sheets.spreadsheets.values.append({
    spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:`${spec.title}!A:${columnByKey[key]}`,
    valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:rows},
  })
}

export async function applyImportPlan(plan:ImportPlan,hash:string,importId:string){
  if(await hasImportPayloadHash(hash))throw new Error('IMPORT_ALREADY_APPLIED')
  if(plan.blockingIssues.length)throw new Error('IMPORT_HAS_BLOCKING_ISSUES')
  await ensureHeaders()
  const sheets=requiredClient()
  const rowsByKey=importRowsForPlan(plan)

  // Histories are appended before the customer snapshot. Retries filter exact rows; generated
  // point rows include importId in their description, while visit rows use multiset matching.
  for(const item of rowsByKey){
    if(item.key==='customers')continue
    const existing=await currentRowsForKey(item.key)
    await appendRows(sheets,item.key,missingRows(existing,item.rows))
  }

  // The customer list is a target snapshot, so rerunning a partially completed import is idempotent.
  await replaceCustomers(plan.customers)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId:process.env.GOOGLE_SHEET_ID!,requestBody:{requests:[importMetadataRequest(hash)]},
  })
  return {importId,summary:plan.summary}
}
