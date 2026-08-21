import {sheets} from '@googleapis/sheets'
import {JWT} from 'google-auth-library'
import {Customer, Source} from './domain'

const headers=['id','phone','source','visits','points','lastVisit']

function client(){
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key=process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g,'\n')
  if(!email||!key||!process.env.GOOGLE_SHEET_ID) return null
  const auth=new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']})
  return sheets({version:'v4',auth})
}

export async function readCustomers():Promise<Customer[]>{
  const sheets=client(); if(!sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED')
  const result=await sheets.spreadsheets.values.get({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Customers!A:F'})
  const rows=result.data.values??[]
  return rows.slice(1).filter(row=>row[0]).map(row=>({id:String(row[0]),phone:String(row[1]??''),source:row[2] as Source|undefined,visits:Number(row[3]??0),points:Number(row[4]??0),lastVisit:String(row[5]??'')}))
}

export async function ensureHeaders(){
  const sheets=client(); if(!sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED')
  await sheets.spreadsheets.values.update({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Customers!A1:F1',valueInputOption:'RAW',requestBody:{values:[headers]}})
}

export async function replaceCustomers(customers:Customer[]){
  const sheets=client(); if(!sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED')
  await sheets.spreadsheets.values.clear({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Customers!A2:F'})
  if(customers.length) await sheets.spreadsheets.values.update({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Customers!A2:F',valueInputOption:'RAW',requestBody:{values:customers.map(c=>[c.id,c.phone,c.source??'',c.visits,c.points,c.lastVisit])}})
}

export async function appendVisit(phone:string, source:Source|undefined, points:number){
  const sheets=client(); if(!sheets) throw new Error('GOOGLE_SHEETS_NOT_CONFIGURED')
  await sheets.spreadsheets.values.append({spreadsheetId:process.env.GOOGLE_SHEET_ID!,range:'Visits!A:D',valueInputOption:'RAW',requestBody:{values:[[new Date().toISOString().slice(0,10),phone,source??'',points]]}})
}
