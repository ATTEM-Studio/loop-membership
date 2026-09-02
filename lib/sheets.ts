import {google, sheets_v4} from 'googleapis'
import {
  BalanceLedgerEntry,
  Customer,
  DEFAULT_EARNING_SETTINGS,
  EarningSettings,
  PaymentLedgerEntry,
  PointTransaction,
  ReturnReasonEntry,
  Reward,
  Source,
  VisitEntry,
} from './domain'

type SheetGroup='customer'|'point'|'settings'
export type SheetContext={spreadsheetId:string}
type SheetKey=
  |'customers'|'visits'|'returnReasons'
  |'transactions'|'pointLedger'|'stampLedger'|'paymentLedger'
  |'rewards'|'paymentRewards'|'earningSettings'|'connection'

type SheetSpec={
  key:SheetKey
  title:string
  legacyTitle:string
  group:SheetGroup
  headers:readonly string[]
  tabColor:{red:number;green:number;blue:number}
}

const customerHeaders=['고객ID','전화번호','최초유입경로','방문횟수','방문포인트','최근방문일','개인정보동의일시','개인정보동의버전','도장개수','결제포인트']
const transactionHeaders=['일시','전화번호','거래유형','변동포인트','변동전잔액','변동후잔액','내용']
const rewardHeaders=['혜택ID','혜택명','필요포인트','사용여부']
const visitHeaders=['날짜','전화번호','최초유입경로','당시방문포인트']
const balanceLedgerHeaders=['일시','전화번호','변동량','변동전잔액','변동후잔액','내용']
const paymentLedgerHeaders=['일시','전화번호','결제금액','적립률(%)','적립포인트','변동전잔액','변동후잔액','내용']
const returnReasonHeaders=['날짜','전화번호','방문회차','사유ID','재방문사유']
const earningSettingsHeaders=['적립방식','결제적립률','도장목표개수','도장완성혜택','업종','재방문설문설정']
const connectionHeaders=['업체명','연결코드','사용상태','앱표시명']

const GROUP_COLORS:Record<SheetGroup,{red:number;green:number;blue:number}>={
  customer:{red:0.12,green:0.50,blue:0.40},
  point:{red:0.84,green:0.60,blue:0.22},
  settings:{red:0.35,green:0.44,blue:0.72},
}

export const SHEET_LAYOUT:readonly SheetSpec[]=[
  {key:'customers',title:'고객_목록',legacyTitle:'Customers',group:'customer',headers:customerHeaders,tabColor:GROUP_COLORS.customer},
  {key:'visits',title:'고객_방문기록',legacyTitle:'Visits',group:'customer',headers:visitHeaders,tabColor:GROUP_COLORS.customer},
  {key:'returnReasons',title:'고객_재방문설문',legacyTitle:'ReturnReasons',group:'customer',headers:returnReasonHeaders,tabColor:GROUP_COLORS.customer},
  {key:'transactions',title:'포인트_전체거래내역',legacyTitle:'Transactions',group:'point',headers:transactionHeaders,tabColor:GROUP_COLORS.point},
  {key:'pointLedger',title:'포인트_방문적립내역',legacyTitle:'PointLedger',group:'point',headers:balanceLedgerHeaders,tabColor:GROUP_COLORS.point},
  {key:'stampLedger',title:'포인트_도장적립내역',legacyTitle:'StampLedger',group:'point',headers:balanceLedgerHeaders,tabColor:GROUP_COLORS.point},
  {key:'paymentLedger',title:'포인트_결제적립내역',legacyTitle:'PaymentPointLedger',group:'point',headers:paymentLedgerHeaders,tabColor:GROUP_COLORS.point},
  {key:'rewards',title:'설정_방문포인트혜택',legacyTitle:'Settings',group:'settings',headers:rewardHeaders,tabColor:GROUP_COLORS.settings},
  {key:'paymentRewards',title:'설정_결제포인트혜택',legacyTitle:'PaymentRewards',group:'settings',headers:rewardHeaders,tabColor:GROUP_COLORS.settings},
  {key:'earningSettings',title:'설정_적립방식',legacyTitle:'EarningSettings',group:'settings',headers:earningSettingsHeaders,tabColor:GROUP_COLORS.settings},
  {key:'connection',title:'설정_매장연결',legacyTitle:'StoreConnection',group:'settings',headers:connectionHeaders,tabColor:GROUP_COLORS.settings},
]

const DASHBOARD_TITLES=new Set(['대시보드','대쉬보드','Dashboard','dashboard'])

export function sheetLayoutIndexes(properties:readonly {sheetId?:number|null;title?:string|null}[]){
  const placements:{sheetId:number;index:number}[]=[]
  const dashboard=properties.find(sheet=>sheet.title&&DASHBOARD_TITLES.has(sheet.title))
  const hasDashboard=dashboard?.sheetId!==undefined&&dashboard.sheetId!==null
  if(hasDashboard) placements.push({sheetId:dashboard.sheetId as number,index:0})

  const startIndex=hasDashboard?1:0
  SHEET_LAYOUT.forEach((spec,index)=>{
    const sheet=properties.find(properties=>properties.title===spec.title)
    if(sheet?.sheetId===undefined||sheet.sheetId===null) return
    placements.push({sheetId:sheet.sheetId,index:startIndex+index})
  })
  return placements
}

const SHEET_BY_KEY=Object.fromEntries(SHEET_LAYOUT.map(spec=>[spec.key,spec])) as Record<SheetKey,SheetSpec>
const workbookLayoutPromises=new Map<string,Promise<void>>()

export const DEFAULT_REWARDS:Reward[]=[
  {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true},
  {id:'discount-3000',name:'3,000원 할인',points:20,enabled:true},
]

export const DEFAULT_PAYMENT_REWARDS:Reward[]=[
  {id:'payment-1000',name:'1,000원 할인',points:1000,enabled:true},
  {id:'payment-3000',name:'3,000원 할인',points:3000,enabled:true},
]

export function getDefaultSheetContext(context?:SheetContext):SheetContext{
  const spreadsheetId=context?.spreadsheetId?.trim()||process.env.GOOGLE_SHEET_ID?.trim()
  if(!spreadsheetId)throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED')
  return {spreadsheetId}
}

function client(context?:SheetContext){
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')
  if(!email||!key||!context?.spreadsheetId&&!process.env.GOOGLE_SHEET_ID) return null
  const auth=new google.auth.JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']})
  return google.sheets({version:'v4',auth})
}

function requiredClient(context?:SheetContext){
  const sheets=client(context); if(!sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED')
  return sheets
}

function spreadsheetId(context?:SheetContext){return getDefaultSheetContext(context).spreadsheetId}

function text(value:unknown){const v=String(value??'').trim();return v||undefined}
function endColumn(width:number){return String.fromCharCode(64+width)}

export function customerFromRow(row:unknown[]):Customer{
  return {
    id:String(row[0]??''),
    phone:String(row[1]??''),
    source:text(row[2]) as Source|undefined,
    visits:Number(row[3]??0),
    points:Number(row[4]??0),
    lastVisit:String(row[5]??''),
    privacyConsentAt:text(row[6]),
    privacyConsentVersion:text(row[7]),
    stamps:Number(row[8]??0),
    paymentPoints:Number(row[9]??0),
  }
}

export function customerToRow(customer:Customer){
  return [
    customer.id,customer.phone,customer.source??'',String(customer.visits),String(customer.points),customer.lastVisit,
    customer.privacyConsentAt??'',customer.privacyConsentVersion??'',String(customer.stamps??0),String(customer.paymentPoints??0)
  ]
}

export function rewardFromRow(row:unknown[]):Reward{
  return {
    id:String(row[0]??''),
    name:String(row[1]??''),
    points:Number(row[2]??0),
    enabled:String(row[3]??'true').toLowerCase()!=='false',
  }
}

export function rewardToRow(reward:Reward){return [reward.id,reward.name,reward.points,reward.enabled]}
export function transactionToRow(t:PointTransaction){return [t.date,t.phone,t.type,t.delta,t.balanceBefore,t.balanceAfter,t.description]}
export function transactionFromRow(row:unknown[]):PointTransaction{
  return {
    date:String(row[0]??''),
    phone:String(row[1]??''),
    type:String(row[2]??'EARN') as PointTransaction['type'],
    delta:Number(row[3]??0),
    balanceBefore:Number(row[4]??0),
    balanceAfter:Number(row[5]??0),
    description:String(row[6]??''),
  }
}

export function balanceLedgerToRow(entry:BalanceLedgerEntry){
  return [entry.date,entry.phone,entry.delta,entry.balanceBefore,entry.balanceAfter,entry.description]
}
export function balanceLedgerFromRow(row:unknown[]):BalanceLedgerEntry{
  return {
    date:String(row[0]??''),phone:String(row[1]??''),delta:Number(row[2]??0),
    balanceBefore:Number(row[3]??0),balanceAfter:Number(row[4]??0),description:String(row[5]??''),
  }
}
export function paymentLedgerToRow(entry:PaymentLedgerEntry){
  return [entry.date,entry.phone,entry.paymentAmount,entry.rate,entry.delta,entry.balanceBefore,entry.balanceAfter,entry.description]
}
export function paymentLedgerFromRow(row:unknown[]):PaymentLedgerEntry{
  return {
    date:String(row[0]??''),phone:String(row[1]??''),paymentAmount:Number(row[2]??0),rate:Number(row[3]??0),
    delta:Number(row[4]??0),balanceBefore:Number(row[5]??0),balanceAfter:Number(row[6]??0),description:String(row[7]??''),
  }
}
export function returnReasonToRow(entry:ReturnReasonEntry){return [entry.date,entry.phone,entry.visitNumber,entry.reasonId,entry.reasonLabel]}
export function returnReasonFromRow(row:unknown[]):ReturnReasonEntry{
  return {date:String(row[0]??''),phone:String(row[1]??''),visitNumber:Number(row[2]??0),reasonId:String(row[3]??''),reasonLabel:String(row[4]??'')}
}
export function visitFromRow(row:unknown[]):VisitEntry{
  return {date:String(row[0]??''),phone:String(row[1]??''),source:text(row[2]) as Source|undefined,points:Number(row[3]??0)}
}

export function earningSettingsToRow(settings:EarningSettings){
  return [settings.mode,settings.paymentRate,settings.stampGoal,settings.stampRewardName,settings.industry,JSON.stringify(settings.returnReasons)]
}
export function earningSettingsFromRow(row:unknown[]):EarningSettings{
  let reasons=DEFAULT_EARNING_SETTINGS.returnReasons.map(reason=>({...reason}))
  try{
    const parsed=JSON.parse(String(row[5]??'[]'))
    if(Array.isArray(parsed)&&parsed.length) reasons=parsed.slice(0,6).map((reason,index)=>({
      id:String(reason?.id??`reason-${index+1}`),label:String(reason?.label??''),thanks:String(reason?.thanks??''),
    })).filter(reason=>reason.label&&reason.thanks)
  }catch{}
  return {
    mode:(String(row[0]??DEFAULT_EARNING_SETTINGS.mode) as EarningSettings['mode']),
    paymentRate:Number(row[1]??DEFAULT_EARNING_SETTINGS.paymentRate),
    stampGoal:Number(row[2]??DEFAULT_EARNING_SETTINGS.stampGoal),
    stampRewardName:String(row[3]??DEFAULT_EARNING_SETTINGS.stampRewardName),
    industry:(String(row[4]??DEFAULT_EARNING_SETTINGS.industry) as EarningSettings['industry']),
    returnReasons:reasons.length?reasons:DEFAULT_EARNING_SETTINGS.returnReasons.map(reason=>({...reason})),
  }
}

async function loadSheetProperties(sheets:sheets_v4.Sheets,context?:SheetContext){
  const result=await sheets.spreadsheets.get({spreadsheetId:spreadsheetId(context),fields:'sheets.properties'})
  return (result.data.sheets??[])
    .map(sheet=>sheet.properties)
    .filter((properties):properties is sheets_v4.Schema$SheetProperties=>Boolean(properties))
}

async function prepareWorkbookLayout(sheets:sheets_v4.Sheets,context?:SheetContext){
  const id=spreadsheetId(context)
  let properties=await loadSheetProperties(sheets,context)
  const setupRequests:sheets_v4.Schema$Request[]=[]

  for(const spec of SHEET_LAYOUT){
    const current=properties.find(sheet=>sheet.title===spec.title)
    if(current) continue
    const legacy=properties.find(sheet=>sheet.title===spec.legacyTitle)
    if(legacy?.sheetId!==undefined&&legacy.sheetId!==null){
      setupRequests.push({updateSheetProperties:{properties:{sheetId:legacy.sheetId,title:spec.title},fields:'title'}})
    }else{
      setupRequests.push({addSheet:{properties:{title:spec.title,tabColorStyle:{rgbColor:spec.tabColor}}}})
    }
  }

  if(setupRequests.length){
    await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests:setupRequests}})
    properties=await loadSheetProperties(sheets,context)
  }

  const layoutRequests:sheets_v4.Schema$Request[]=[]
  for(const placement of sheetLayoutIndexes(properties)){
    const sheet=properties.find(properties=>properties.sheetId===placement.sheetId)
    const spec=SHEET_LAYOUT.find(spec=>spec.title===sheet?.title)
    layoutRequests.push({
      updateSheetProperties:{
        properties:spec
          ?{sheetId:placement.sheetId,index:placement.index,tabColorStyle:{rgbColor:spec.tabColor}}
          :{sheetId:placement.sheetId,index:placement.index},
        fields:spec?'index,tabColorStyle':'index',
      },
    })
  }
  if(layoutRequests.length) await sheets.spreadsheets.batchUpdate({spreadsheetId:id,requestBody:{requests:layoutRequests}})

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId:id,
    requestBody:{
      valueInputOption:'RAW',
      data:SHEET_LAYOUT.map(spec=>({
        range:`${spec.title}!A1:${endColumn(spec.headers.length)}1`,
        values:[[...spec.headers]],
      })),
    },
  })
}

async function ensureWorkbookLayout(sheets:sheets_v4.Sheets,context?:SheetContext){
  const id=spreadsheetId(context)
  let workbookLayoutPromise=workbookLayoutPromises.get(id)
  if(!workbookLayoutPromise){
    workbookLayoutPromise=prepareWorkbookLayout(sheets,{spreadsheetId:id}).catch(error=>{
      workbookLayoutPromises.delete(id)
      throw error
    })
    workbookLayoutPromises.set(id,workbookLayoutPromise)
  }
  await workbookLayoutPromise
}

async function ensureSheet(sheets:sheets_v4.Sheets,key:SheetKey,context?:SheetContext){
  await ensureWorkbookLayout(sheets,context)
  return SHEET_BY_KEY[key]
}

export async function ensureHeaders(context?:SheetContext){
  const sheets=requiredClient(context)
  await ensureWorkbookLayout(sheets,context)
}

export async function readCustomers(context?:SheetContext):Promise<Customer[]>{
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'customers',context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:J`})
  const rows=result.data.values??[]
  return rows.slice(1).filter(row=>row[0]).map(customerFromRow)
}

export async function replaceCustomers(customers:Customer[],context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'customers',context)
  const id=spreadsheetId(context)
  await sheets.spreadsheets.values.clear({spreadsheetId:id,range:`${spec.title}!A2:J`})
  if(customers.length) await sheets.spreadsheets.values.update({spreadsheetId:id,range:`${spec.title}!A2:J`,valueInputOption:'RAW',requestBody:{values:customers.map(customerToRow)}})
}

export async function appendTransaction(transaction:PointTransaction,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'transactions',context)
  await sheets.spreadsheets.values.append({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:G`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[transactionToRow(transaction)]}})
}

export async function readTransactions(context?:SheetContext):Promise<PointTransaction[]>{
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'transactions',context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:G`})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(transactionFromRow)
}

export async function readTransactionsForPhone(phone:string,context?:SheetContext):Promise<PointTransaction[]>{
  return (await readTransactions(context)).filter(transaction=>transaction.phone===phone).reverse()
}

type RewardSheetKey='rewards'|'paymentRewards'
async function readRewardSheet(key:RewardSheetKey,defaults:Reward[],context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,key,context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:D`})
  const rewards=(result.data.values??[]).slice(1).filter(row=>row[0]).map(rewardFromRow).filter(reward=>reward.id&&reward.name&&reward.points>0)
  return rewards.length?rewards:defaults.map(reward=>({...reward}))
}
async function saveRewardSheet(key:RewardSheetKey,rewards:Reward[],context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,key,context)
  const id=spreadsheetId(context)
  await sheets.spreadsheets.values.clear({spreadsheetId:id,range:`${spec.title}!A2:D`})
  if(rewards.length) await sheets.spreadsheets.values.update({spreadsheetId:id,range:`${spec.title}!A2:D`,valueInputOption:'RAW',requestBody:{values:rewards.map(rewardToRow)}})
}

export async function readRewards(context?:SheetContext){return readRewardSheet('rewards',DEFAULT_REWARDS,context)}
export async function saveRewards(rewards:Reward[],context?:SheetContext){return saveRewardSheet('rewards',rewards,context)}
export async function readPaymentRewards(context?:SheetContext){return readRewardSheet('paymentRewards',DEFAULT_PAYMENT_REWARDS,context)}
export async function savePaymentRewards(rewards:Reward[],context?:SheetContext){return saveRewardSheet('paymentRewards',rewards,context)}

export async function readEarningSettings(context?:SheetContext):Promise<EarningSettings>{
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'earningSettings',context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:F`})
  const row=(result.data.values??[])[1]
  return row?earningSettingsFromRow(row):{
    ...DEFAULT_EARNING_SETTINGS,
    returnReasons:DEFAULT_EARNING_SETTINGS.returnReasons.map(reason=>({...reason})),
  }
}

export async function saveEarningSettings(settings:EarningSettings,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'earningSettings',context)
  const id=spreadsheetId(context)
  await sheets.spreadsheets.values.clear({spreadsheetId:id,range:`${spec.title}!A2:F`})
  await sheets.spreadsheets.values.update({spreadsheetId:id,range:`${spec.title}!A2:F`,valueInputOption:'RAW',requestBody:{values:[earningSettingsToRow(settings)]}})
}

type BalanceLedgerKey='pointLedger'|'stampLedger'
async function appendBalanceLedger(key:BalanceLedgerKey,entry:BalanceLedgerEntry,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,key,context)
  await sheets.spreadsheets.values.append({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:F`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[balanceLedgerToRow(entry)]}})
}
async function readBalanceLedger(key:BalanceLedgerKey,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,key,context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:F`})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(balanceLedgerFromRow)
}

export async function appendPointLedger(entry:BalanceLedgerEntry,context?:SheetContext){return appendBalanceLedger('pointLedger',entry,context)}
export async function appendStampLedger(entry:BalanceLedgerEntry,context?:SheetContext){return appendBalanceLedger('stampLedger',entry,context)}
export async function readPointLedger(context?:SheetContext){return readBalanceLedger('pointLedger',context)}
export async function readStampLedger(context?:SheetContext){return readBalanceLedger('stampLedger',context)}

export async function appendPaymentLedger(entry:PaymentLedgerEntry,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'paymentLedger',context)
  await sheets.spreadsheets.values.append({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:H`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[paymentLedgerToRow(entry)]}})
}
export async function readPaymentLedger(context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'paymentLedger',context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:H`})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(paymentLedgerFromRow)
}

export async function appendReturnReason(entry:ReturnReasonEntry,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'returnReasons',context)
  await sheets.spreadsheets.values.append({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:E`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[returnReasonToRow(entry)]}})
}
export async function readReturnReasons(context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'returnReasons',context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:E`})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(returnReasonFromRow)
}

export async function readVisits(context?:SheetContext):Promise<VisitEntry[]>{
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'visits',context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:D`})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(visitFromRow)
}

async function purgePhoneRows(sheets:sheets_v4.Sheets,key:Exclude<SheetKey,'customers'|'rewards'|'paymentRewards'|'earningSettings'|'connection'>,phone:string,context?:SheetContext){
  const spec=await ensureSheet(sheets,key,context)
  const id=spreadsheetId(context)
  const end=endColumn(spec.headers.length)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:id,range:`${spec.title}!A:${end}`})
  const rows=result.data.values??[]
  const filtered=rows.slice(1).filter(row=>String(row[1]??'')!==phone)
  await sheets.spreadsheets.values.clear({spreadsheetId:id,range:`${spec.title}!A2:${end}`})
  if(filtered.length) await sheets.spreadsheets.values.update({spreadsheetId:id,range:`${spec.title}!A2:${end}`,valueInputOption:'RAW',requestBody:{values:filtered}})
}

export async function deleteCustomerData(customerId:string,context?:SheetContext){
  const customers=await readCustomers(context)
  const found=customers.find(customer=>customer.id===customerId)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  await replaceCustomers(customers.filter(customer=>customer.id!==customerId),context)
  const sheets=requiredClient(context)
  await purgePhoneRows(sheets,'visits',found.phone,context)
  await purgePhoneRows(sheets,'transactions',found.phone,context)
  await purgePhoneRows(sheets,'pointLedger',found.phone,context)
  await purgePhoneRows(sheets,'stampLedger',found.phone,context)
  await purgePhoneRows(sheets,'paymentLedger',found.phone,context)
  await purgePhoneRows(sheets,'returnReasons',found.phone,context)
  return {id:customerId}
}

// Backward-compatible visit log retained for existing sheets and analytics.
export async function appendVisit(phone:string, source:Source|undefined, points:number,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'visits',context)
  await sheets.spreadsheets.values.append({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:D`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[[new Date().toISOString().slice(0,10),phone,source??'',points]]}})
}

export type StoreConnection={storeName:string;connectionCode:string;status:string;appName:string}

export function connectionFromRow(row:unknown[]):StoreConnection{
  return {storeName:String(row[0]??''),connectionCode:String(row[1]??''),status:String(row[2]??'정상'),appName:String(row[3]??row[0]??'LOOP')}
}

export function connectionToRow(connection:StoreConnection){
  return [connection.storeName,connection.connectionCode,connection.status,connection.appName]
}

export async function readStoreConnection(context?:SheetContext):Promise<StoreConnection|null>{
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'connection',context)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:spreadsheetId(context),range:`${spec.title}!A:D`})
  const row=(result.data.values??[])[1]
  return row?connectionFromRow(row):null
}

export async function saveStoreConnection(connection:StoreConnection,context?:SheetContext){
  const sheets=requiredClient(context); const spec=await ensureSheet(sheets,'connection',context)
  const id=spreadsheetId(context)
  await sheets.spreadsheets.values.clear({spreadsheetId:id,range:`${spec.title}!A2:D`})
  await sheets.spreadsheets.values.update({spreadsheetId:id,range:`${spec.title}!A2:D`,valueInputOption:'RAW',requestBody:{values:[connectionToRow(connection)]}})
}
