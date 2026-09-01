import {
  Customer,
  PointTransaction,
  PRIVACY_CONSENT_VERSION,
  Reward,
  Source,
  hasCurrentPrivacyConsent,
  normalizePhone,
  redeemPoints,
} from './domain'

export const ADMIN_PIN = '9999'

export function isAdminPin(pin:string){return pin===ADMIN_PIN}

type EarnInput = {
  phone:string
  source?:Source
  consent:boolean
  now:string
  id?:string
}

type MemberResult = {
  customers:Customer[]
  customer:Customer
  transaction:PointTransaction
}

type ConsentResult = {
  customers:Customer[]
  customer:Customer
}

function replaceCustomer(customers:Customer[],customer:Customer){
  return customers.some(item=>item.id===customer.id)
    ?customers.map(item=>item.id===customer.id?customer:item)
    :[...customers,customer]
}

export function acceptPrivacyConsent(customers:Customer[],phoneValue:string,now:string):ConsentResult{
  const phone=normalizePhone(phoneValue)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  const customer:Customer={
    ...found,
    privacyConsentAt:now,
    privacyConsentVersion:PRIVACY_CONSENT_VERSION,
  }
  return {customers:replaceCustomer(customers,customer),customer}
}

export function earnPoint(customers:Customer[],input:EarnInput):MemberResult{
  const phone=normalizePhone(input.phone)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found&&!input.source) throw new Error('SOURCE_REQUIRED')
  if((!found||!hasCurrentPrivacyConsent(found))&&!input.consent) throw new Error('CONSENT_REQUIRED')

  const before=found?.points??0
  const consentFields=input.consent?{
    privacyConsentAt:input.now,
    privacyConsentVersion:PRIVACY_CONSENT_VERSION,
  }:{
    privacyConsentAt:found?.privacyConsentAt,
    privacyConsentVersion:found?.privacyConsentVersion,
  }
  const customer:Customer={
    id:found?.id??input.id??crypto.randomUUID(),
    phone,
    source:found?.source??input.source,
    visits:(found?.visits??0)+1,
    points:before+1,
    lastVisit:input.now.slice(0,10),
    ...consentFields,
  }
  const transaction:PointTransaction={
    date:input.now,
    phone,
    type:'EARN',
    delta:1,
    balanceBefore:before,
    balanceAfter:customer.points,
    description:'방문 포인트 적립',
  }
  return {customers:replaceCustomer(customers,customer),customer,transaction}
}

export function redeemReward(customers:Customer[],phoneValue:string,reward:Reward,now:string):MemberResult{
  const phone=normalizePhone(phoneValue)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  if(!reward.enabled||!Number.isInteger(reward.points)||reward.points<=0) throw new Error('INVALID_REWARD')
  const customer=redeemPoints(found,reward.points)
  const transaction:PointTransaction={
    date:now,
    phone,
    type:'REDEEM',
    delta:-reward.points,
    balanceBefore:found.points,
    balanceAfter:customer.points,
    description:reward.name,
  }
  return {customers:replaceCustomer(customers,customer),customer,transaction}
}

export function sanitizeRewards(input:unknown):Reward[]{
  if(!Array.isArray(input)) throw new Error('INVALID_REWARDS')
  const rewards=input.map((value,index)=>{
    const item=(value??{}) as Partial<Reward>
    const name=String(item.name??'').trim()
    const points=Number(item.points)
    const id=String(item.id??`reward-${index+1}`).trim()||`reward-${index+1}`
    if(!name||!Number.isInteger(points)||points<=0) throw new Error('INVALID_REWARDS')
    return {id,name,points,enabled:item.enabled!==false}
  })
  if(!rewards.length) throw new Error('INVALID_REWARDS')
  return rewards
}
