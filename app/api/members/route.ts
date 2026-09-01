import {NextResponse} from 'next/server'
import {hasCurrentPrivacyConsent, maskPhone, normalizePhone, type Customer, type Source} from '../../../lib/domain'
import {acceptPrivacyConsent, earnPoint, isAdminPin, redeemReward} from '../../../lib/member-service'
import {appendTransaction, appendVisit, deleteCustomerData, readCustomers, readRewards, replaceCustomers} from '../../../lib/sheets'

type Action='lookup'|'consent'|'earn'|'redeem'|'delete'
type MemberRequest={
  action?:Action
  phone?:string
  source?:Source
  consent?:boolean
  rewardId?:string
  pin?:string
  customerId?:string
}

function errorStatus(message:string){
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED') return 503
  if(message==='INVALID_PIN') return 401
  if(message==='CUSTOMER_NOT_FOUND'||message==='REWARD_NOT_FOUND') return 404
  if(message==='INSUFFICIENT_POINTS') return 409
  if(['INVALID_PHONE','SOURCE_REQUIRED','CONSENT_REQUIRED','INVALID_REWARD','INVALID_POINTS'].includes(message)) return 400
  return 500
}

function kioskCustomer(customer:Customer){
  return {
    phone:customer.phone,
    visits:customer.visits,
    points:customer.points,
    lastVisit:customer.lastVisit,
    consentCurrent:hasCurrentPrivacyConsent(customer),
  }
}

function adminCustomer(customer:Customer){
  return {
    id:customer.id,
    phoneMasked:maskPhone(customer.phone),
    source:customer.source,
    visits:customer.visits,
    points:customer.points,
    lastVisit:customer.lastVisit,
  }
}

export async function GET(request:Request){
  try{
    if(!isAdminPin(request.headers.get('x-admin-pin')??'')) throw new Error('INVALID_PIN')
    const customers=await readCustomers()
    return NextResponse.json({customers:customers.map(adminCustomer),storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message,storage:'google-sheets'},{status:errorStatus(message)})
  }
}

export async function POST(request:Request){
  try{
    const body=await request.json() as MemberRequest
    const action=body.action??'earn'

    if(action==='delete'){
      if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')
      if(!body.customerId) throw new Error('CUSTOMER_NOT_FOUND')
      const deleted=await deleteCustomerData(body.customerId)
      return NextResponse.json({deleted,storage:'google-sheets'})
    }

    const phone=normalizePhone(body.phone??'')
    if(phone.length<10) throw new Error('INVALID_PHONE')
    const customers=await readCustomers()

    if(action==='lookup'){
      // Unknown numbers are checked in memory only and are never persisted before explicit consent.
      const customer=customers.find(item=>item.phone===phone)??null
      return NextResponse.json({customer:customer?kioskCustomer(customer):null,storage:'google-sheets'})
    }

    if(action==='consent'){
      if(body.consent!==true) throw new Error('CONSENT_REQUIRED')
      const result=acceptPrivacyConsent(customers,phone,new Date().toISOString())
      await replaceCustomers(result.customers)
      return NextResponse.json({customer:kioskCustomer(result.customer),storage:'google-sheets'})
    }

    if(action==='redeem'){
      if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')
      const rewards=await readRewards()
      const reward=rewards.find(item=>item.id===body.rewardId&&item.enabled)
      if(!reward) throw new Error('REWARD_NOT_FOUND')
      const latestCustomers=await readCustomers()
      const result=redeemReward(latestCustomers,phone,reward,new Date().toISOString())
      await replaceCustomers(result.customers)
      await appendTransaction(result.transaction)
      return NextResponse.json({customer:kioskCustomer(result.customer),reward,storage:'google-sheets'})
    }

    const now=new Date().toISOString()
    const result=earnPoint(customers,{phone,source:body.source,consent:body.consent===true,now})
    await replaceCustomers(result.customers)
    await appendTransaction(result.transaction)
    await appendVisit(phone,result.customer.source,1)
    return NextResponse.json({customer:kioskCustomer(result.customer),storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}
