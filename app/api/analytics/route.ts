import {NextResponse} from 'next/server'
import {buildAnalytics} from '../../../lib/analytics'
import {isAdminPin} from '../../../lib/member-service'
import {
  readCustomers,
  readEarningSettings,
  readPaymentLedger,
  readStampLedger,
  readTransactions,
  readVisits,
} from '../../../lib/sheets'
import {getTenantContext} from '../../../lib/tenant-request'

function errorStatus(message:string){
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED') return 503
  if(message==='INVALID_PIN') return 401
  return 500
}

export async function GET(request:Request){
  try{
    if(!isAdminPin(request.headers.get('x-admin-pin')??'')) throw new Error('INVALID_PIN')
    const context=getTenantContext(request)
    const [customers,visits,transactions,stampLedger,paymentLedger,settings]=await Promise.all([
      readCustomers(context),readVisits(context),readTransactions(context),readStampLedger(context),readPaymentLedger(context),readEarningSettings(context),
    ])
    const analytics=buildAnalytics(customers,visits,transactions,stampLedger,paymentLedger,settings.mode)
    return NextResponse.json({analytics,mode:settings.mode,storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}
