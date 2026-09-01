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

const customerHeaders=['id','phone','source','visits','points','lastVisit','privacyConsentAt','privacyConsentVersion','stamps','paymentPoints']
const transactionHeaders=['date','phone','type','delta','balanceBefore','balanceAfter','description']
const rewardHeaders=['id','name','points','enabled']
const visitHeaders=['date','phone','source','points']
const balanceLedgerHeaders=['date','phone','delta','balanceBefore','balanceAfter','description']
const paymentLedgerHeaders=['date','phone','paymentAmount','rate','delta','balanceBefore','balanceAfter','description']
const returnReasonHeaders=['date','phone','visitNumber','reasonId','reasonLabel']
const earningSettingsHeaders=['mode','paymentRate','stampGoal','stampRewardName','industry','returnReasonsJson']

export const DEFAULT_REWARDS:Reward[]=[
  {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true},
  {id:'discount-3000',name:'3,000원 할인',points:20,enabled:true},
]

export const DEFAULT_PAYMENT_REWARDS:Reward[]=[
  {id:'payment-1000',name:'1,000원 할인',points:1000,enabled:true},
  {id:'payment-3000',name:'3,000원 할인',points:3000,enabled:true},
]

function client(){
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')
  if(!email||!key||!process.env.GOOGLE_SHEET_ID) return null
  const auth=new google.auth.JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']})
  return google.sheets({version:'v4',auth})
}

function requiredClient(){
  const sheets=client(); if(!sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED')
  return sheets
}

function text(value:unknown){const v=String(value??'').trim();return v||undefined}

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

async function ensureSheet(sheets:sheets_v4.Sheets,title:string,headers:string[]){
  const spreadsheetId=process.env.GOOGLE_SHEET_ID!
  const meta=await sheets.spreadsheets.get({spreadsheetId,fields:'sheets.properties.title'})
  const exists=(meta.data.sheets??[]).some(sheet=>sheet.properties?.title===title)
  if(!exists){
    await sheets.spreadsheets.batchUpdate({spreadsheetId,requestBody:{requests:[{addSheet:{properties:{title}}}]}})
  }
  const end=String.fromCharCode(64+headers.length)
  await sheets.spreadsheets.values.update({spreadsheetId,range:`${title}!A1:${end}1`,valueInputOption:'RAW',requestBody:{values:[headers]}})
}

export async function ensureHeaders(){
  const sheets=requiredClient()
  await ensureSheet(sheets,'Customers',customerHeaders)
}

export async function readCustomers():Promise<Customer[]>{
  const sheets=requiredClient(); await ensureSheet(sheets,'Customers',customerHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Customers!A:J'})
  const rows=result.data.values??[]
  return rows.slice(1).filter(row=>row[0]).map(customerFromRow)
}

export async function replaceCustomers(customers:Customer[]){
  const sheets=requiredClient(); await ensureSheet(sheets,'Customers',customerHeaders)
  const spreadsheetId=process.env.GOOGLE_SHEET_ID!
  await sheets.spreadsheets.values.clear({spreadsheetId,range:'Customers!A2:J'})
  if(customers.length) await sheets.spreadsheets.values.update({spreadsheetId,range:'Customers!A2:J',valueInputOption:'RAW',requestBody:{values:customers.map(customerToRow)}})
}

export async function appendTransaction(transaction:PointTransaction){
  const sheets=requiredClient(); await ensureSheet(sheets,'Transactions',transactionHeaders)
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Transactions!A:G',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[transactionToRow(transaction)]}})
}

export async function readTransactions():Promise<PointTransaction[]>{
  const sheets=requiredClient(); await ensureSheet(sheets,'Transactions',transactionHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Transactions!A:G'})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(transactionFromRow)
}

export async function readTransactionsForPhone(phone:string):Promise<PointTransaction[]>{
  return (await readTransactions()).filter(transaction=>transaction.phone===phone).reverse()
}

async function readRewardSheet(title:string,defaults:Reward[]){
  const sheets=requiredClient(); await ensureSheet(sheets,title,rewardHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:`${title}!A:D`})
  const rewards=(result.data.values??[]).slice(1).filter(row=>row[0]).map(rewardFromRow).filter(reward=>reward.id&&reward.name&&reward.points>0)
  return rewards.length?rewards:defaults.map(reward=>({...reward}))
}
async function saveRewardSheet(title:string,rewards:Reward[]){
  const sheets=requiredClient(); await ensureSheet(sheets,title,rewardHeaders)
  const spreadsheetId=process.env.GOOGLE_SHEET_ID!
  await sheets.spreadsheets.values.clear({spreadsheetId,range:`${title}!A2:D`})
  if(rewards.length) await sheets.spreadsheets.values.update({spreadsheetId,range:`${title}!A2:D`,valueInputOption:'RAW',requestBody:{values:rewards.map(rewardToRow)}})
}

export async function readRewards(){return readRewardSheet('Settings',DEFAULT_REWARDS)}
export async function saveRewards(rewards:Reward[]){return saveRewardSheet('Settings',rewards)}
export async function readPaymentRewards(){return readRewardSheet('PaymentRewards',DEFAULT_PAYMENT_REWARDS)}
export async function savePaymentRewards(rewards:Reward[]){return saveRewardSheet('PaymentRewards',rewards)}

export async function readEarningSettings():Promise<EarningSettings>{
  const sheets=requiredClient(); await ensureSheet(sheets,'EarningSettings',earningSettingsHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'EarningSettings!A:F'})
  const row=(result.data.values??[])[1]
  return row?earningSettingsFromRow(row):{
    ...DEFAULT_EARNING_SETTINGS,
    returnReasons:DEFAULT_EARNING_SETTINGS.returnReasons.map(reason=>({...reason})),
  }
}

export async function saveEarningSettings(settings:EarningSettings){
  const sheets=requiredClient(); await ensureSheet(sheets,'EarningSettings',earningSettingsHeaders)
  const spreadsheetId=process.env.GOOGLE_SHEET_ID!
  await sheets.spreadsheets.values.clear({spreadsheetId,range:'EarningSettings!A2:F'})
  await sheets.spreadsheets.values.update({spreadsheetId,range:'EarningSettings!A2:F',valueInputOption:'RAW',requestBody:{values:[earningSettingsToRow(settings)]}})
}

async function appendBalanceLedger(title:string,entry:BalanceLedgerEntry){
  const sheets=requiredClient(); await ensureSheet(sheets,title,balanceLedgerHeaders)
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:`${title}!A:F`,valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[balanceLedgerToRow(entry)]}})
}
async function readBalanceLedger(title:string){
  const sheets=requiredClient(); await ensureSheet(sheets,title,balanceLedgerHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:`${title}!A:F`})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(balanceLedgerFromRow)
}

export async function appendPointLedger(entry:BalanceLedgerEntry){return appendBalanceLedger('PointLedger',entry)}
export async function appendStampLedger(entry:BalanceLedgerEntry){return appendBalanceLedger('StampLedger',entry)}
export async function readPointLedger(){return readBalanceLedger('PointLedger')}
export async function readStampLedger(){return readBalanceLedger('StampLedger')}

export async function appendPaymentLedger(entry:PaymentLedgerEntry){
  const sheets=requiredClient(); await ensureSheet(sheets,'PaymentPointLedger',paymentLedgerHeaders)
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'PaymentPointLedger!A:H',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[paymentLedgerToRow(entry)]}})
}
export async function readPaymentLedger(){
  const sheets=requiredClient(); await ensureSheet(sheets,'PaymentPointLedger',paymentLedgerHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'PaymentPointLedger!A:H'})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(paymentLedgerFromRow)
}

export async function appendReturnReason(entry:ReturnReasonEntry){
  const sheets=requiredClient(); await ensureSheet(sheets,'ReturnReasons',returnReasonHeaders)
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'ReturnReasons!A:E',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[returnReasonToRow(entry)]}})
}
export async function readReturnReasons(){
  const sheets=requiredClient(); await ensureSheet(sheets,'ReturnReasons',returnReasonHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'ReturnReasons!A:E'})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(returnReasonFromRow)
}

export async function readVisits():Promise<VisitEntry[]>{
  const sheets=requiredClient(); await ensureSheet(sheets,'Visits',visitHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Visits!A:D'})
  return (result.data.values??[]).slice(1).filter(row=>row[0]).map(visitFromRow)
}

async function purgePhoneRows(sheets:sheets_v4.Sheets,title:string,headers:string[],range:string,phone:string){
  await ensureSheet(sheets,title,headers)
  const spreadsheetId=process.env.GOOGLE_SHEET_ID!
  const result=await sheets.spreadsheets.values.get({spreadsheetId,range})
  const rows=result.data.values??[]
  const filtered=rows.slice(1).filter(row=>String(row[1]??'')!==phone)
  const width=headers.length
  const end=String.fromCharCode(64+width)
  await sheets.spreadsheets.values.clear({spreadsheetId,range:`${title}!A2:${end}`})
  if(filtered.length) await sheets.spreadsheets.values.update({spreadsheetId,range:`${title}!A2:${end}`,valueInputOption:'RAW',requestBody:{values:filtered}})
}

export async function deleteCustomerData(customerId:string){
  const customers=await readCustomers()
  const found=customers.find(customer=>customer.id===customerId)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  await replaceCustomers(customers.filter(customer=>customer.id!==customerId))
  const sheets=requiredClient()
  await purgePhoneRows(sheets,'Visits',visitHeaders,'Visits!A:D',found.phone)
  await purgePhoneRows(sheets,'Transactions',transactionHeaders,'Transactions!A:G',found.phone)
  await purgePhoneRows(sheets,'PointLedger',balanceLedgerHeaders,'PointLedger!A:F',found.phone)
  await purgePhoneRows(sheets,'StampLedger',balanceLedgerHeaders,'StampLedger!A:F',found.phone)
  await purgePhoneRows(sheets,'PaymentPointLedger',paymentLedgerHeaders,'PaymentPointLedger!A:H',found.phone)
  await purgePhoneRows(sheets,'ReturnReasons',returnReasonHeaders,'ReturnReasons!A:E',found.phone)
  return {id:customerId}
}

// Backward-compatible visit log retained for existing sheets and analytics.
export async function appendVisit(phone:string, source:Source|undefined, points:number){
  const sheets=requiredClient(); await ensureSheet(sheets,'Visits',visitHeaders)
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Visits!A:D',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[[new Date().toISOString().slice(0,10),phone,source??'',points]]}})
}
