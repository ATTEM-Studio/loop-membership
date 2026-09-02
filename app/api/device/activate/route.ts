import {NextResponse} from 'next/server'
import {createTenantToken,extractSpreadsheetId} from '../../../../lib/tenant-auth'
import {validateStoreConnection} from '../../../../lib/tenant-activation'
import {readStoreConnection} from '../../../../lib/sheets'

type ActivationRequest={spreadsheetId?:string;connectionCode?:string;deviceId?:string}

function statusFor(message:string){
  if(message==='INVALID_SPREADSHEET_ID'||message==='INVALID_CONNECTION_CODE'||message==='STORE_CONNECTION_NOT_CONFIGURED')return 400
  if(message==='STORE_INACTIVE')return 403
  if(message==='SHEET_ACCESS_DENIED')return 403
  if(message==='TENANT_AUTH_NOT_CONFIGURED')return 503
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED')return 503
  return 500
}

export async function POST(request:Request){
  try{
    const body=await request.json() as ActivationRequest
    const id=extractSpreadsheetId(body.spreadsheetId??'')
    const deviceId=String(body.deviceId??'').trim()
    if(!deviceId)throw new Error('INVALID_DEVICE_ID')
    const connection=validateStoreConnection(await readStoreConnection({spreadsheetId:id}),String(body.connectionCode??''))
    const secret=process.env.LOOP_AUTH_SECRET?.trim()
    if(!secret)throw new Error('TENANT_AUTH_NOT_CONFIGURED')
    const token=createTenantToken({spreadsheetId:id,deviceId,issuedAt:Date.now(),version:1},secret)
    return NextResponse.json({token,storeName:connection.storeName,appName:connection.appName,storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message,storage:'google-sheets'},{status:statusFor(message)})
  }
}
