import {NextResponse} from 'next/server'
import {normalizePhone, type Source} from '../../../lib/domain'
import {acceptPrivacyConsent, earnPoint, isAdminPin, redeemReward} from '../../../lib/member-service'
import {appendTransaction, appendVisit, readCustomers, readRewards, replaceCustomers} from '../../../lib/sheets'

type Action='lookup'|'consent'|'earn'|'redeem'
type MemberRequest={
  action?:Action
  phone?:string
  source?:Source
  consent?:boolean
  rewardId?:string
  pin?:string
}

function errorStatus(message:string){
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED') return 503
  if(message==='INVALID_PIN') return 401
  if(message==='CUSTOMER_NOT_FOUND'||message==='REWARD_NOT_FOUND') return 404
  if(message==='INSUFFICIENT_POINTS') return 409
  if(['INVALID_PHONE','SOURCE_REQUIRED','CONSENT_REQUIRED','INVALID_REWARD','INVALID_POINTS'].includes(message)) return 400
  return 500
}

export async function GET(request:Request){
  try{
    if(!isAdminPin(request.headers.get('x-admin-pin')??'')) throw new Error('INVALID_PIN')
    return NextResponse.json({customers:await readCustomers(),storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message,storage:'google-sheets'},{status:errorStatus(message)})
  }
}

export async function POST(request:Request){
  try{
    const body=await request.json() as MemberRequest
    const action=body.action??'earn'
    const phone=normalizePhone(body.phone??'')
    if(phone.length<10) throw new Error('INVALID_PHONE')

    const customers=await readCustomers()

    if(action==='lookup'){
      // Lookup never persists an unknown number. New customers are only stored after explicit consent.
      const customer=customers.find(item=>item.phone===phone)??null
      return NextResponse.json({customer,storage:'google-sheets'})
    }

    if(action==='consent'){
      if(body.consent!==true) throw new Error('CONSENT_REQUIRED')
      const result=acceptPrivacyConsent(customers,phone,new Date().toISOString())
      await replaceCustomers(result.customers)
      return NextResponse.json({customer:result.customer,storage:'google-sheets'})
    }

    if(action==='redeem'){
      if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')
      const rewards=await readRewards()
      const reward=rewards.find(item=>item.id===body.rewardId&&item.enabled)
      if(!reward) throw new Error('REWARD_NOT_FOUND')
      // Re-read immediately before decrement so the server validates the latest stored balance.
      const latestCustomers=await readCustomers()
      const result=redeemReward(latestCustomers,phone,reward,new Date().toISOString())
      await replaceCustomers(result.customers)
      await appendTransaction(result.transaction)
      return NextResponse.json({customer:result.customer,reward,storage:'google-sheets'})
    }

    const now=new Date().toISOString()
    const result=earnPoint(customers,{
      phone,
      source:body.source,
      consent:body.consent===true,
      now,
    })
    await replaceCustomers(result.customers)
    await appendTransaction(result.transaction)
    await appendVisit(phone,result.customer.source,1)
    return NextResponse.json({customer:result.customer,storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}
