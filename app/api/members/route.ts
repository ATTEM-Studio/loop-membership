import {NextResponse} from 'next/server'
import {hasCurrentPrivacyConsent, maskPhone, normalizePhone, type Customer, type PointTransaction, type Source} from '../../../lib/domain'
import {
  acceptPrivacyConsent,
  adjustCustomerPoints,
  earnPaymentPoints,
  earnPoint,
  earnStamp,
  isAdminPin,
  redeemPaymentReward,
  redeemReward,
  redeemStampCoupon,
} from '../../../lib/member-service'
import {
  appendPaymentLedger,
  appendPointLedger,
  appendReturnReason,
  appendStampLedger,
  appendTransaction,
  appendVisit,
  deleteCustomerData,
  readCustomers,
  readEarningSettings,
  readPaymentRewards,
  readRewards,
  readTransactionsForPhone,
  replaceCustomers,
} from '../../../lib/sheets'

type Action='lookup'|'consent'|'earn'|'redeem'|'redeemStamp'|'returnReason'|'delete'|'detail'|'adjust'
type MemberRequest={
  action?:Action
  phone?:string
  source?:Source
  consent?:boolean
  rewardId?:string
  pin?:string
  customerId?:string
  targetPoints?:number
  paymentAmount?:number
  reasonId?:string
}

function errorStatus(message:string){
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED') return 503
  if(message==='INVALID_PIN') return 401
  if(message==='CUSTOMER_NOT_FOUND'||message==='REWARD_NOT_FOUND'||message==='RETURN_REASON_NOT_FOUND') return 404
  if(['INSUFFICIENT_POINTS','POINTS_UNCHANGED','STAMP_NOT_COMPLETE'].includes(message)) return 409
  if(['INVALID_PHONE','SOURCE_REQUIRED','CONSENT_REQUIRED','INVALID_REWARD','INVALID_POINTS','INVALID_PAYMENT_AMOUNT','INVALID_PAYMENT_RATE','PAYMENT_POINTS_TOO_SMALL','INVALID_STAMP_GOAL','STAMP_REDEMPTION_REQUIRED'].includes(message)) return 400
  return 500
}

function kioskCustomer(customer:Customer){
  return {
    phone:customer.phone,
    visits:customer.visits,
    points:customer.points,
    stamps:customer.stamps??0,
    paymentPoints:customer.paymentPoints??0,
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
    stamps:customer.stamps??0,
    paymentPoints:customer.paymentPoints??0,
    lastVisit:customer.lastVisit,
  }
}

function adminTransaction(transaction:PointTransaction){
  return {
    date:transaction.date,
    type:transaction.type,
    delta:transaction.delta,
    balanceBefore:transaction.balanceBefore,
    balanceAfter:transaction.balanceAfter,
    description:transaction.description,
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

    if(action==='detail'||action==='adjust'){
      if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')
      if(!body.customerId) throw new Error('CUSTOMER_NOT_FOUND')
      const adminCustomers=await readCustomers()
      const found=adminCustomers.find(customer=>customer.id===body.customerId)
      if(!found) throw new Error('CUSTOMER_NOT_FOUND')

      if(action==='detail'){
        const transactions=await readTransactionsForPhone(found.phone)
        return NextResponse.json({
          customer:adminCustomer(found),
          transactions:transactions.map(adminTransaction),
          storage:'google-sheets',
        })
      }

      const result=adjustCustomerPoints(adminCustomers,found.id,Number(body.targetPoints),new Date().toISOString())
      await replaceCustomers(result.customers)
      await appendTransaction(result.transaction)
      await appendPointLedger(result.ledger)
      const transactions=await readTransactionsForPhone(found.phone)
      return NextResponse.json({
        customer:adminCustomer(result.customer),
        transaction:adminTransaction(result.transaction),
        transactions:transactions.map(adminTransaction),
        storage:'google-sheets',
      })
    }

    const phone=normalizePhone(body.phone??'')
    if(phone.length<10) throw new Error('INVALID_PHONE')
    const customers=await readCustomers()

    if(action==='lookup'){
      const customer=customers.find(item=>item.phone===phone)??null
      return NextResponse.json({customer:customer?kioskCustomer(customer):null,storage:'google-sheets'})
    }

    if(action==='consent'){
      if(body.consent!==true) throw new Error('CONSENT_REQUIRED')
      const result=acceptPrivacyConsent(customers,phone,new Date().toISOString())
      await replaceCustomers(result.customers)
      return NextResponse.json({customer:kioskCustomer(result.customer),storage:'google-sheets'})
    }

    const earningSettings=await readEarningSettings()

    if(action==='returnReason'){
      const found=customers.find(customer=>customer.phone===phone)
      if(!found) throw new Error('CUSTOMER_NOT_FOUND')
      if(!hasCurrentPrivacyConsent(found)) throw new Error('CONSENT_REQUIRED')
      const reason=earningSettings.returnReasons.find(item=>item.id===body.reasonId)
      if(!reason) throw new Error('RETURN_REASON_NOT_FOUND')
      await appendReturnReason({
        date:new Date().toISOString(),
        phone,
        visitNumber:found.visits+1,
        reasonId:reason.id,
        reasonLabel:reason.label,
      })
      return NextResponse.json({thanks:reason.thanks,storage:'google-sheets'})
    }

    if(action==='redeemStamp'){
      if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')
      const latestCustomers=await readCustomers()
      const result=redeemStampCoupon(latestCustomers,phone,earningSettings.stampGoal,earningSettings.stampRewardName,new Date().toISOString())
      await replaceCustomers(result.customers)
      await appendStampLedger(result.ledger)
      return NextResponse.json({customer:kioskCustomer(result.customer),rewardName:earningSettings.stampRewardName,storage:'google-sheets'})
    }

    if(action==='redeem'){
      if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')
      if(earningSettings.mode==='stamp') throw new Error('STAMP_REDEMPTION_REQUIRED')
      const rewards=earningSettings.mode==='payment'?await readPaymentRewards():await readRewards()
      const reward=rewards.find(item=>item.id===body.rewardId&&item.enabled)
      if(!reward) throw new Error('REWARD_NOT_FOUND')
      const latestCustomers=await readCustomers()
      if(earningSettings.mode==='payment'){
        const result=redeemPaymentReward(latestCustomers,phone,reward,new Date().toISOString())
        await replaceCustomers(result.customers)
        await appendPaymentLedger(result.ledger)
        return NextResponse.json({customer:kioskCustomer(result.customer),reward,mode:earningSettings.mode,storage:'google-sheets'})
      }
      const result=redeemReward(latestCustomers,phone,reward,new Date().toISOString())
      await replaceCustomers(result.customers)
      await appendTransaction(result.transaction)
      await appendPointLedger(result.ledger)
      return NextResponse.json({customer:kioskCustomer(result.customer),reward,mode:earningSettings.mode,storage:'google-sheets'})
    }

    const now=new Date().toISOString()
    const input={phone,source:body.source,consent:body.consent===true,now}
    if(earningSettings.mode==='stamp'){
      const result=earnStamp(customers,input)
      await replaceCustomers(result.customers)
      await appendStampLedger(result.ledger)
      await appendVisit(phone,result.customer.source,0)
      return NextResponse.json({customer:kioskCustomer(result.customer),mode:earningSettings.mode,storage:'google-sheets'})
    }
    if(earningSettings.mode==='payment'){
      const result=earnPaymentPoints(customers,{...input,paymentAmount:Number(body.paymentAmount),rate:earningSettings.paymentRate})
      await replaceCustomers(result.customers)
      await appendPaymentLedger(result.ledger)
      await appendVisit(phone,result.customer.source,0)
      return NextResponse.json({customer:kioskCustomer(result.customer),earned:result.ledger.delta,mode:earningSettings.mode,storage:'google-sheets'})
    }

    const result=earnPoint(customers,input)
    await replaceCustomers(result.customers)
    await appendTransaction(result.transaction)
    await appendPointLedger(result.ledger)
    await appendVisit(phone,result.customer.source,1)
    return NextResponse.json({customer:kioskCustomer(result.customer),mode:earningSettings.mode,storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}
