import {NextResponse} from 'next/server'
import {addVisit, normalizePhone, Source} from '../../../lib/domain'
import {appendVisit, ensureHeaders, readCustomers, replaceCustomers} from '../../../lib/sheets'

export async function GET(){
  try{return NextResponse.json({customers:await readCustomers(),storage:'google-sheets'})}
  catch(error){const message=error instanceof Error?error.message:'UNKNOWN_ERROR';return NextResponse.json({error:message,storage:'local'}, {status:message==='GOOGLE_SHEETS_NOT_CONFIGURED'?503:500})}
}

export async function POST(request:Request){
  try{
    const body=await request.json() as {phone?:string;source?:Source}
    const phone=normalizePhone(body.phone??''); if(phone.length<10)return NextResponse.json({error:'INVALID_PHONE'},{status:400})
    const customers=await readCustomers(); const found=customers.find(c=>c.phone===phone)
    const updated=found?addVisit(found):addVisit({id:crypto.randomUUID(),phone,source:body.source,visits:0,points:0,lastVisit:''},body.source)
    await ensureHeaders(); await replaceCustomers(found?customers.map(c=>c.id===found.id?updated:c):[...customers,updated]); await appendVisit(phone,body.source??found?.source,1)
    return NextResponse.json({customer:updated,storage:'google-sheets'})
  }catch(error){const message=error instanceof Error?error.message:'UNKNOWN_ERROR';return NextResponse.json({error:message},{status:message==='GOOGLE_SHEETS_NOT_CONFIGURED'?503:500})}
}
