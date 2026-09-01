import {
  BalanceLedgerEntry,
  Customer,
  DEFAULT_EARNING_SETTINGS,
  EarningSettings,
  IndustryPreset,
  PaymentLedgerEntry,
  PointTransaction,
  PRIVACY_CONSENT_VERSION,
  RETURN_REASON_PRESETS,
  ReturnReason,
  Reward,
  Source,
  hasCurrentPrivacyConsent,
  normalizePhone,
  redeemPoints,
} from './domain'

export const ADMIN_PIN = process.env.LOOP_ADMIN_PIN?.trim() || '9999'

export function isAdminPin(pin:string){return pin===ADMIN_PIN}

export type EarnInput = {
  phone:string
  source?:Source
  consent:boolean
  now:string
  id?:string
}

export type VisitMemberResult = {
  customers:Customer[]
  customer:Customer
  transaction:PointTransaction
  ledger:BalanceLedgerEntry
}

export type BalanceMemberResult = {
  customers:Customer[]
  customer:Customer
  ledger:BalanceLedgerEntry
}

export type PaymentMemberResult = {
  customers:Customer[]
  customer:Customer
  ledger:PaymentLedgerEntry
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

function prepareEarn(customers:Customer[],input:EarnInput){
  const phone=normalizePhone(input.phone)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found&&!input.source) throw new Error('SOURCE_REQUIRED')
  if((!found||!hasCurrentPrivacyConsent(found))&&!input.consent) throw new Error('CONSENT_REQUIRED')
  const consentFields=input.consent?{
    privacyConsentAt:input.now,
    privacyConsentVersion:PRIVACY_CONSENT_VERSION,
  }:{
    privacyConsentAt:found?.privacyConsentAt,
    privacyConsentVersion:found?.privacyConsentVersion,
  }
  const base:Customer={
    id:found?.id??input.id??crypto.randomUUID(),
    phone,
    source:found?.source??input.source,
    visits:(found?.visits??0)+1,
    points:found?.points??0,
    stamps:found?.stamps??0,
    paymentPoints:found?.paymentPoints??0,
    lastVisit:input.now.slice(0,10),
    ...consentFields,
  }
  return {phone,found,base}
}

function validateReward(reward:Reward){
  if(!reward.enabled||!Number.isInteger(reward.points)||reward.points<=0) throw new Error('INVALID_REWARD')
}

export function acceptPrivacyConsent(customers:Customer[],phoneValue:string,now:string):ConsentResult{
  const phone=normalizePhone(phoneValue)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  const customer:Customer={
    ...found,
    stamps:found.stamps??0,
    paymentPoints:found.paymentPoints??0,
    privacyConsentAt:now,
    privacyConsentVersion:PRIVACY_CONSENT_VERSION,
  }
  return {customers:replaceCustomer(customers,customer),customer}
}

export function earnPoint(customers:Customer[],input:EarnInput):VisitMemberResult{
  const {phone,base}=prepareEarn(customers,input)
  const before=base.points
  const customer:Customer={...base,points:before+1}
  const transaction:PointTransaction={
    date:input.now,
    phone,
    type:'EARN',
    delta:1,
    balanceBefore:before,
    balanceAfter:customer.points,
    description:'방문 포인트 적립',
  }
  const ledger:BalanceLedgerEntry={
    date:input.now,phone,delta:1,balanceBefore:before,balanceAfter:customer.points,description:'방문 포인트 적립',
  }
  return {customers:replaceCustomer(customers,customer),customer,transaction,ledger}
}

export function earnStamp(customers:Customer[],input:EarnInput):BalanceMemberResult{
  const {phone,base}=prepareEarn(customers,input)
  const before=base.stamps??0
  const customer:Customer={...base,stamps:before+1}
  const ledger:BalanceLedgerEntry={
    date:input.now,phone,delta:1,balanceBefore:before,balanceAfter:customer.stamps??0,description:'방문 도장 적립',
  }
  return {customers:replaceCustomer(customers,customer),customer,ledger}
}

export function earnPaymentPoints(customers:Customer[],input:EarnInput&{paymentAmount:number;rate:number}):PaymentMemberResult{
  if(!Number.isInteger(input.paymentAmount)||input.paymentAmount<=0) throw new Error('INVALID_PAYMENT_AMOUNT')
  if(!Number.isFinite(input.rate)||input.rate<=0||input.rate>100) throw new Error('INVALID_PAYMENT_RATE')
  const earned=Math.floor(input.paymentAmount*input.rate/100)
  if(earned<1) throw new Error('PAYMENT_POINTS_TOO_SMALL')
  const {phone,base}=prepareEarn(customers,input)
  const before=base.paymentPoints??0
  const customer:Customer={...base,paymentPoints:before+earned}
  const ledger:PaymentLedgerEntry={
    date:input.now,phone,paymentAmount:input.paymentAmount,rate:input.rate,delta:earned,
    balanceBefore:before,balanceAfter:customer.paymentPoints??0,description:'결제금액 포인트 적립',
  }
  return {customers:replaceCustomer(customers,customer),customer,ledger}
}

export function redeemReward(customers:Customer[],phoneValue:string,reward:Reward,now:string):VisitMemberResult{
  const phone=normalizePhone(phoneValue)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  validateReward(reward)
  const customer={...redeemPoints(found,reward.points),stamps:found.stamps??0,paymentPoints:found.paymentPoints??0}
  const transaction:PointTransaction={
    date:now,phone,type:'REDEEM',delta:-reward.points,balanceBefore:found.points,balanceAfter:customer.points,description:reward.name,
  }
  const ledger:BalanceLedgerEntry={
    date:now,phone,delta:-reward.points,balanceBefore:found.points,balanceAfter:customer.points,description:reward.name,
  }
  return {customers:replaceCustomer(customers,customer),customer,transaction,ledger}
}

export function redeemPaymentReward(customers:Customer[],phoneValue:string,reward:Reward,now:string):PaymentMemberResult{
  const phone=normalizePhone(phoneValue)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  validateReward(reward)
  const before=found.paymentPoints??0
  if(before<reward.points) throw new Error('INSUFFICIENT_POINTS')
  const customer:Customer={...found,stamps:found.stamps??0,paymentPoints:before-reward.points}
  const ledger:PaymentLedgerEntry={
    date:now,phone,paymentAmount:0,rate:0,delta:-reward.points,balanceBefore:before,
    balanceAfter:customer.paymentPoints??0,description:reward.name,
  }
  return {customers:replaceCustomer(customers,customer),customer,ledger}
}

export function redeemStampCoupon(customers:Customer[],phoneValue:string,goal:number,rewardName:string,now:string):BalanceMemberResult{
  const phone=normalizePhone(phoneValue)
  if(phone.length<10) throw new Error('INVALID_PHONE')
  if(!Number.isInteger(goal)||goal<2) throw new Error('INVALID_STAMP_GOAL')
  const found=customers.find(customer=>customer.phone===phone)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  const before=found.stamps??0
  if(before<goal) throw new Error('STAMP_NOT_COMPLETE')
  const customer:Customer={...found,stamps:before-goal,paymentPoints:found.paymentPoints??0}
  const ledger:BalanceLedgerEntry={
    date:now,phone,delta:-goal,balanceBefore:before,balanceAfter:customer.stamps??0,description:rewardName.trim()||'도장 쿠폰 사용',
  }
  return {customers:replaceCustomer(customers,customer),customer,ledger}
}

export function adjustCustomerPoints(customers:Customer[],customerId:string,targetPoints:number,now:string):VisitMemberResult{
  if(!Number.isInteger(targetPoints)||targetPoints<0) throw new Error('INVALID_POINTS')
  const found=customers.find(customer=>customer.id===customerId)
  if(!found) throw new Error('CUSTOMER_NOT_FOUND')
  const delta=targetPoints-found.points
  if(delta===0) throw new Error('POINTS_UNCHANGED')
  const customer:Customer={...found,stamps:found.stamps??0,paymentPoints:found.paymentPoints??0,points:targetPoints}
  const transaction:PointTransaction={
    date:now,phone:found.phone,type:'ADJUST',delta,balanceBefore:found.points,balanceAfter:targetPoints,description:'관리자 포인트 조정',
  }
  const ledger:BalanceLedgerEntry={
    date:now,phone:found.phone,delta,balanceBefore:found.points,balanceAfter:targetPoints,description:'관리자 포인트 조정',
  }
  return {customers:replaceCustomer(customers,customer),customer,transaction,ledger}
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

const MODES=['visit','stamp','payment'] as const
const INDUSTRIES=['cafe','restaurant','clinic','beauty','fitness','custom'] as const

export function sanitizeEarningSettings(input:unknown):EarningSettings{
  const item=(input??{}) as Partial<EarningSettings>
  const mode=MODES.includes(item.mode as typeof MODES[number])?item.mode as EarningSettings['mode']:DEFAULT_EARNING_SETTINGS.mode
  const industry=INDUSTRIES.includes(item.industry as typeof INDUSTRIES[number])?item.industry as IndustryPreset:DEFAULT_EARNING_SETTINGS.industry
  const paymentRate=item.paymentRate===undefined?DEFAULT_EARNING_SETTINGS.paymentRate:Number(item.paymentRate)
  const stampGoal=item.stampGoal===undefined?DEFAULT_EARNING_SETTINGS.stampGoal:Number(item.stampGoal)
  const stampRewardName=String(item.stampRewardName??DEFAULT_EARNING_SETTINGS.stampRewardName).trim()
  if(!Number.isFinite(paymentRate)||paymentRate<=0||paymentRate>100) throw new Error('INVALID_EARNING_SETTINGS')
  if(!Number.isInteger(stampGoal)||stampGoal<2||stampGoal>30) throw new Error('INVALID_EARNING_SETTINGS')
  if(!stampRewardName) throw new Error('INVALID_EARNING_SETTINGS')

  const sourceReasons=Array.isArray(item.returnReasons)&&item.returnReasons.length
    ?item.returnReasons
    :RETURN_REASON_PRESETS[industry]
  const returnReasons:ReturnReason[]=sourceReasons.slice(0,6).map((reason,index)=>{
    const raw=(reason??{}) as Partial<ReturnReason>
    const label=String(raw.label??'').trim()
    const thanks=String(raw.thanks??'').trim()
    const id=String(raw.id??`reason-${index+1}`).trim()||`reason-${index+1}`
    if(!label||!thanks) throw new Error('INVALID_EARNING_SETTINGS')
    return {id,label,thanks}
  })
  if(!returnReasons.length) throw new Error('INVALID_EARNING_SETTINGS')
  return {mode,paymentRate,stampGoal,stampRewardName,industry,returnReasons}
}

export function requiresPaymentModeExitConfirmation(current:EarningSettings,next:EarningSettings,customers:Customer[]){
  return current.mode==='payment'&&next.mode!=='payment'&&customers.some(customer=>(customer.paymentPoints??0)>0)
}
