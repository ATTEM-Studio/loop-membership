import {NextResponse} from 'next/server'
import {isAdminPin, requiresPaymentModeExitConfirmation, sanitizeEarningSettings, sanitizeRewards} from '../../../lib/member-service'
import {
  readCustomers,
  readEarningSettings,
  readPaymentRewards,
  readRewards,
  saveEarningSettings,
  savePaymentRewards,
  saveRewards,
} from '../../../lib/sheets'
import {getTenantContext} from '../../../lib/tenant-request'

function errorStatus(message:string){
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED') return 503
  if(message==='INVALID_PIN') return 401
  if(message==='PAYMENT_MODE_EXIT_CONFIRM_REQUIRED') return 409
  if(message==='INVALID_REWARDS'||message==='INVALID_EARNING_SETTINGS') return 400
  return 500
}

export async function GET(request:Request){
  try{
    const context=getTenantContext(request)
    const [rewards,paymentRewards,earningSettings]=await Promise.all([
      readRewards(context),readPaymentRewards(context),readEarningSettings(context),
    ])
    return NextResponse.json({rewards,paymentRewards,earningSettings,storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}

export async function PUT(request:Request){
  try{
    const context=getTenantContext(request)
    const body=await request.json() as {
      pin?:string
      rewards?:unknown
      paymentRewards?:unknown
      earningSettings?:unknown
      confirmPaymentModeExit?:boolean
    }
    if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')

    const [currentRewards,currentPaymentRewards,currentEarningSettings,customers]=await Promise.all([
      readRewards(context),readPaymentRewards(context),readEarningSettings(context),readCustomers(context),
    ])
    const rewards=body.rewards===undefined?currentRewards:sanitizeRewards(body.rewards)
    const paymentRewards=body.paymentRewards===undefined?currentPaymentRewards:sanitizeRewards(body.paymentRewards)
    const earningSettings=body.earningSettings===undefined?currentEarningSettings:sanitizeEarningSettings(body.earningSettings)

    if(requiresPaymentModeExitConfirmation(currentEarningSettings,earningSettings,customers)&&body.confirmPaymentModeExit!==true){
      throw new Error('PAYMENT_MODE_EXIT_CONFIRM_REQUIRED')
    }

    await Promise.all([
      saveRewards(rewards,context),
      savePaymentRewards(paymentRewards,context),
      saveEarningSettings(earningSettings,context),
    ])
    return NextResponse.json({rewards,paymentRewards,earningSettings,storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}
