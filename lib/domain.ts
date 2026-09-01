export type Source = '네이버'|'인스타'|'카카오'|'당근'|'구글'|'지나가다가'
export type EarningMode = 'visit'|'stamp'|'payment'
export type IndustryPreset = 'cafe'|'restaurant'|'clinic'|'beauty'|'fitness'|'custom'

export type ReturnReason = {
  id:string
  label:string
  thanks:string
}

export type Customer = {
  id:string
  phone:string
  source?:Source
  visits:number
  points:number
  stamps?:number
  paymentPoints?:number
  lastVisit:string
  privacyConsentAt?:string
  privacyConsentVersion?:string
}

export type Reward = {
  id:string
  name:string
  points:number
  enabled:boolean
}

export type PointTransaction = {
  date:string
  phone:string
  type:'EARN'|'REDEEM'|'ADJUST'
  delta:number
  balanceBefore:number
  balanceAfter:number
  description:string
}

export type BalanceLedgerEntry = {
  date:string
  phone:string
  delta:number
  balanceBefore:number
  balanceAfter:number
  description:string
}

export type PaymentLedgerEntry = BalanceLedgerEntry & {
  paymentAmount:number
  rate:number
}

export type ReturnReasonEntry = {
  date:string
  phone:string
  visitNumber:number
  reasonId:string
  reasonLabel:string
}

export type VisitEntry = {
  date:string
  phone:string
  source?:Source
  points:number
}

export type EarningSettings = {
  mode:EarningMode
  paymentRate:number
  stampGoal:number
  stampRewardName:string
  industry:IndustryPreset
  returnReasons:ReturnReason[]
}

export const PRIVACY_CONSENT_VERSION = '2026-09-01-v1'
export const SOURCES: Source[] = ['네이버','인스타','카카오','당근','구글','지나가다가']

export const RETURN_REASON_PRESETS:Record<IndustryPreset,ReturnReason[]> = {
  cafe:[
    {id:'coffee',label:'커피 생각나서',thanks:'커피 생각의 끝이 여기라니, 꽤 뿌듯한데요? ☕'},
    {id:'dessert',label:'디저트 생각나서',thanks:'달달한 생각에 저희가 떠올랐다니 오늘도 잘 모실게요 🍰'},
    {id:'vibe',label:'분위기가 좋아서',thanks:'공간까지 기억해주셨다니, 오늘도 편하게 머물다 가세요.'},
    {id:'nearby',label:'가까워서',thanks:'가까운 곳 중에 다시 골라주셔서 더 반가워요.'},
    {id:'together',label:'같이 온 사람이 가자고 해서',thanks:'좋은 선택이었다는 말 듣게 오늘도 잘 준비할게요 🙂'},
    {id:'just',label:'그냥 생각나서',thanks:'이유 없이 생각나는 곳이라니, 이건 조금 감동인데요.'},
  ],
  restaurant:[
    {id:'menu',label:'메뉴 생각나서',thanks:'또 생각날 만큼 맛있었다니 오늘도 제대로 준비할게요.'},
    {id:'taste',label:'맛이 좋아서',thanks:'맛으로 다시 찾아주셨다니 주방이 제일 좋아할 답이에요.'},
    {id:'nearby',label:'가까워서',thanks:'가까워도 다시 선택받는 건 늘 고마운 일이죠.'},
    {id:'meeting',label:'모임하기 좋아서',thanks:'좋은 자리로 다시 골라주셔서 오늘도 편하게 모실게요.'},
    {id:'recommend',label:'같이 온 사람이 가자고 해서',thanks:'추천받고 다시 오셨다면 오늘도 선택이 맞았다고 느끼게 해드릴게요.'},
    {id:'just',label:'그냥 생각나서',thanks:'문득 생각나는 식당이라니, 오늘도 맛있게 보답할게요.'},
  ],
  clinic:[
    {id:'followup',label:'재진·예약 일정이라서',thanks:'다시 방문해주셔서 감사합니다. 오늘도 꼼꼼히 안내드리겠습니다.'},
    {id:'care',label:'치료·관리를 이어가려고',thanks:'꾸준히 관리하실 수 있도록 오늘도 세심하게 도와드리겠습니다.'},
    {id:'check',label:'상태를 다시 확인하려고',thanks:'안심하실 수 있도록 필요한 부분을 차분히 확인해드리겠습니다.'},
    {id:'staff',label:'의료진·직원이 편해서',thanks:'편하게 느껴주셨다니 감사합니다. 오늘도 편안하게 안내드릴게요.'},
    {id:'nearby',label:'가까워서',thanks:'가까운 곳에서 믿고 다시 찾아주셔서 감사합니다.'},
    {id:'other',label:'기타',thanks:'다시 찾아주셔서 감사합니다. 오늘도 필요한 도움을 잘 드리겠습니다.'},
  ],
  beauty:[
    {id:'cycle',label:'시술 주기가 돼서',thanks:'딱 필요한 때 다시 찾아주셨네요. 오늘도 예쁘게 준비할게요 ✨'},
    {id:'result',label:'지난 결과가 만족스러워서',thanks:'지난 결과가 마음에 드셨다니 오늘도 기대에 맞춰볼게요.'},
    {id:'designer',label:'담당자가 좋아서',thanks:'사람 때문에 다시 오는 곳이라니, 정말 좋은 칭찬이에요.'},
    {id:'event',label:'이벤트·혜택 때문에',thanks:'혜택도 챙기고 기분 좋은 변화도 함께 가져가세요.'},
    {id:'nearby',label:'가까워서',thanks:'가까운 곳 중 다시 선택해주셔서 더 반가워요.'},
    {id:'just',label:'그냥 생각나서',thanks:'문득 떠올랐다니 오늘도 기분 좋게 보내드릴게요.'},
  ],
  fitness:[
    {id:'routine',label:'운동 루틴이라서',thanks:'루틴을 지키는 날이 쌓이면 결과도 따라오죠. 오늘도 파이팅!'},
    {id:'facility',label:'시설이 편해서',thanks:'편하게 운동할 수 있는 곳으로 다시 골라주셔서 감사합니다.'},
    {id:'trainer',label:'트레이너·코치 때문에',thanks:'좋은 코칭이 다시 오게 만들었다니 오늘도 잘 도와드릴게요.'},
    {id:'class',label:'수업 참여하려고',thanks:'오늘 수업도 알차게 채워가실 수 있게 준비할게요.'},
    {id:'nearby',label:'위치가 편해서',thanks:'오가기 편한 만큼 꾸준히 이어가실 수 있길 응원할게요.'},
    {id:'habit',label:'그냥 습관처럼',thanks:'습관이 된 방문, 가장 강한 이유일지도 몰라요. 오늘도 반가워요.'},
  ],
  custom:[
    {id:'reason-1',label:'다시 오고 싶어서',thanks:'다시 찾아주셔서 정말 반가워요.'},
  ],
}

export const DEFAULT_EARNING_SETTINGS:EarningSettings = {
  mode:'visit',
  paymentRate:3,
  stampGoal:10,
  stampRewardName:'쿠폰 완성 혜택',
  industry:'cafe',
  returnReasons:RETURN_REASON_PRESETS.cafe.map(reason=>({...reason})),
}

export function normalizePhone(value:string){return value.replace(/\D/g,'').slice(-11)}
export function maskPhone(phone:string){const p=normalizePhone(phone); return p.length===11?`${p.slice(0,3)}-${p.slice(3,7)}-****`:p}
export function addVisit(customer:Customer, source?:Source):Customer{return {...customer,source:customer.source??source,visits:customer.visits+1,points:customer.points+1,lastVisit:new Date().toISOString().slice(0,10)}}

export function hasCurrentPrivacyConsent(customer:Customer){
  return Boolean(customer.privacyConsentAt && customer.privacyConsentVersion===PRIVACY_CONSENT_VERSION)
}

export function redeemPoints(customer:Customer, points:number):Customer{
  if(!Number.isInteger(points)||points<=0) throw new Error('INVALID_POINTS')
  if(customer.points<points) throw new Error('INSUFFICIENT_POINTS')
  return {...customer,points:customer.points-points}
}
