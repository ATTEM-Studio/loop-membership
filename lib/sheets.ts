import {google, sheets_v4} from 'googleapis'
import {Customer, PointTransaction, Reward, Source} from './domain'

const customerHeaders=['id','phone','source','visits','points','lastVisit','privacyConsentAt','privacyConsentVersion']
const transactionHeaders=['date','phone','type','delta','balanceBefore','balanceAfter','description']
const rewardHeaders=['id','name','points','enabled']
const visitHeaders=['date','phone','source','points']

export const DEFAULT_REWARDS:Reward[]=[
  {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true},
  {id:'discount-3000',name:'3,000원 할인',points:20,enabled:true},
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
  }
}

export function customerToRow(customer:Customer){
  return [
    customer.id,customer.phone,customer.source??'',String(customer.visits),String(customer.points),customer.lastVisit,
    customer.privacyConsentAt??'',customer.privacyConsentVersion??''
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
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Customers!A:H'})
  const rows=result.data.values??[]
  return rows.slice(1).filter(row=>row[0]).map(customerFromRow)
}

export async function replaceCustomers(customers:Customer[]){
  const sheets=requiredClient(); await ensureSheet(sheets,'Customers',customerHeaders)
  const spreadsheetId=process.env.GOOGLE_SHEET_ID!
  await sheets.spreadsheets.values.clear({spreadsheetId,range:'Customers!A2:H'})
  if(customers.length) await sheets.spreadsheets.values.update({spreadsheetId,range:'Customers!A2:H',valueInputOption:'RAW',requestBody:{values:customers.map(customerToRow)}})
}

export async function appendTransaction(transaction:PointTransaction){
  const sheets=requiredClient(); await ensureSheet(sheets,'Transactions',transactionHeaders)
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Transactions!A:G',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[transactionToRow(transaction)]}})
}

export async function readRewards():Promise<Reward[]>{
  const sheets=requiredClient(); await ensureSheet(sheets,'Settings',rewardHeaders)
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Settings!A:D'})
  const rewards=(result.data.values??[]).slice(1).filter(row=>row[0]).map(rewardFromRow).filter(reward=>reward.id&&reward.name&&reward.points>0)
  return rewards.length?rewards:DEFAULT_REWARDS.map(reward=>({...reward}))
}

export async function saveRewards(rewards:Reward[]){
  const sheets=requiredClient(); await ensureSheet(sheets,'Settings',rewardHeaders)
  const spreadsheetId=process.env.GOOGLE_SHEET_ID!
  await sheets.spreadsheets.values.clear({spreadsheetId,range:'Settings!A2:D'})
  if(rewards.length) await sheets.spreadsheets.values.update({spreadsheetId,range:'Settings!A2:D',valueInputOption:'RAW',requestBody:{values:rewards.map(rewardToRow)}})
}

// Backward-compatible visit log retained for existing sheets and analytics.
export async function appendVisit(phone:string, source:Source|undefined, points:number){
  const sheets=requiredClient(); await ensureSheet(sheets,'Visits',visitHeaders)
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Visits!A:D',valueInputOption:'RAW',insertDataOption:'INSERT_ROWS',requestBody:{values:[[new Date().toISOString().slice(0,10),phone,source??'',points]]}})
}
