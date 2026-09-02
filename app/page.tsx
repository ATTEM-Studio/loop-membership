'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import {ArrowRight,Check,ChevronLeft,Crown,Gift,Heart,History,LockKeyhole,Plus,Save,ShieldCheck,Sparkles,Trash2,Users,X} from 'lucide-react'
import {
  DEFAULT_EARNING_SETTINGS,
  RETURN_REASON_PRESETS,
  SOURCES,
  normalizePhone,
  type EarningMode,
  type EarningSettings,
  type IndustryPreset,
  type ReturnReason,
  type Reward,
  type Source,
} from '../lib/domain'
import {getDeviceId,loadDeviceSession,saveDeviceSession,tenantHeaders,type DeviceSession} from '../lib/device-client'

const FALLBACK_REWARDS:Reward[]=[
  {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true},
  {id:'discount-3000',name:'3,000원 할인',points:20,enabled:true},
]
const FALLBACK_PAYMENT_REWARDS:Reward[]=[
  {id:'payment-1000',name:'1,000원 할인',points:1000,enabled:true},
  {id:'payment-3000',name:'3,000원 할인',points:3000,enabled:true},
]

const INDUSTRY_LABELS:Record<IndustryPreset,string>={
  cafe:'카페 / 베이커리',restaurant:'음식점',clinic:'병·의원',beauty:'미용 / 뷰티',fitness:'헬스 / 운동',custom:'직접 설정',
}
const MODE_COPY:Record<EarningMode,{label:string;short:string;emoji:string;description:string}>={
  visit:{label:'방문 포인트',short:'포인트',emoji:'P',description:'방문 1회마다 1P를 적립합니다.'},
  stamp:{label:'도장 쿠폰',short:'도장',emoji:'✓',description:'방문할 때마다 쿠폰에 도장 1개를 찍습니다.'},
  payment:{label:'결제금액 적립',short:'결제 포인트',emoji:'%',description:'결제금액의 설정 비율만큼 포인트를 적립합니다.'},
}

type KioskCustomer={phone:string;visits:number;points:number;stamps:number;paymentPoints:number;lastVisit:string;consentCurrent:boolean}
type AdminCustomer={id:string;phoneMasked:string;source?:Source;visits:number;points:number;stamps:number;paymentPoints:number;lastVisit:string}
type AdminTransaction={date:string;type:'EARN'|'REDEEM'|'ADJUST';delta:number;balanceBefore:number;balanceAfter:number;description:string}
type AdminCustomerDetail={customer:AdminCustomer;transactions:AdminTransaction[]}
type KioskStep='phone'|'consent'|'source'|'return-reason'|'action'|'payment'|'rewards'|'redeem-pin'|'stamp-pin'|'done'
type CompletedAction='earn'|'redeem'|'stamp-redeem'|null
type AnalyticsPoint={date:string;value:number}
type AnalyticsMetric={label:string;current:number;unit:string;series:AnalyticsPoint[];note:string}
type AnalyticsBundle={customers:AnalyticsMetric;visits:AnalyticsMetric;repeat:AnalyticsMetric;balance:AnalyticsMetric}
type AnalyticsKey=keyof AnalyticsBundle

type SettingsBundle={rewards:Reward[];paymentRewards:Reward[];earningSettings:EarningSettings}

function errorMessage(code:string){
  if(code==='INVALID_PIN')return '비밀번호가 올바르지 않습니다.'
  if(code==='INSUFFICIENT_POINTS')return '보유 포인트가 부족합니다.'
  if(code==='CONSENT_REQUIRED')return '개인정보 수집·이용 동의가 필요합니다.'
  if(code==='GOOGLE_SHEETS_NOT_CONFIGURED')return '데이터 저장소 연결을 확인해주세요.'
  if(code==='CUSTOMER_NOT_FOUND')return '고객 정보를 찾을 수 없습니다. 처음부터 다시 시도해주세요.'
  if(code==='POINTS_UNCHANGED')return '현재 포인트와 동일합니다.'
  if(code==='INVALID_POINTS')return '포인트는 0 이상의 정수로 입력해주세요.'
  if(code==='INVALID_PAYMENT_AMOUNT')return '결제금액을 1원 이상의 정수로 입력해주세요.'
  if(code==='PAYMENT_POINTS_TOO_SMALL')return '현재 금액으로는 1P 미만이라 적립할 수 없습니다.'
  if(code==='STAMP_NOT_COMPLETE')return '아직 도장 쿠폰이 완성되지 않았습니다.'
  if(code==='PAYMENT_MODE_EXIT_CONFIRM_REQUIRED')return '결제 포인트 보존 안내를 확인해주세요.'
  if(code==='INVALID_EARNING_SETTINGS')return '적립 방식 설정값을 다시 확인해주세요.'
  if(code==='INVALID_TENANT_TOKEN')return '매장 연결이 만료되었거나 올바르지 않습니다. 매장을 다시 연결해주세요.'
  if(code==='TENANT_AUTH_NOT_CONFIGURED')return '매장 연결 설정이 완료되지 않았습니다.'
  return '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
}

async function parseResponse(response:Response){
  const data=await response.json().catch(()=>({})) as Record<string,unknown>
  if(!response.ok)throw new Error(String(data.error??'REQUEST_FAILED'))
  return data
}
function formatTransactionDate(value:string){
  const date=new Date(value)
  return Number.isNaN(date.getTime())?value:date.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
}
function transactionLabel(type:AdminTransaction['type']){return type==='EARN'?'적립':type==='REDEEM'?'사용':'관리자 조정'}
function modeBalance(customer:KioskCustomer|AdminCustomer,mode:EarningMode){
  return mode==='stamp'?customer.stamps:mode==='payment'?customer.paymentPoints:customer.points
}
function modeUnit(mode:EarningMode){return mode==='stamp'?'개':'P'}
function money(value:number){return new Intl.NumberFormat('ko-KR').format(value)}

function StoreConnection({onConnected}:{onConnected:(session:DeviceSession)=>void}){
  const [spreadsheetId,setSpreadsheetId]=useState('')
  const [connectionCode,setConnectionCode]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const connect=async()=>{
    if(!spreadsheetId.trim()||!connectionCode.trim()){setError('구글시트 주소와 매장 연결코드를 입력해주세요.');return}
    setBusy(true);setError('')
    try{
      const data=await parseResponse(await fetch('/api/device/activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spreadsheetId,connectionCode,deviceId:getDeviceId()})}))
      const session={token:String(data.token),storeName:String(data.storeName??''),appName:String(data.appName??data.storeName??'LOOP')}
      saveDeviceSession(session);onConnected(session)
    }catch(e){
      const code=e instanceof Error?e.message:'REQUEST_FAILED'
      setError(code==='INVALID_CONNECTION_CODE'?'매장 연결코드가 올바르지 않습니다.':code==='SHEET_ACCESS_DENIED'?'구글시트 공유 권한을 확인해주세요.':'매장 연결에 실패했습니다. 구글시트 주소와 코드를 확인해주세요.')
    }finally{setBusy(false)}
  }
  return <div className="connection-page"><div className="connection-card"><div className="connection-mark">L</div><span className="step">LOOP 매장 연결</span><h1>이 태블릿에서 사용할 매장을 연결해주세요.</h1><p>처음 한 번만 입력하면 이후에는 별도 로그인 없이 계속 사용할 수 있습니다.</p><label><span>구글시트 주소 또는 시트 ID</span><input autoFocus value={spreadsheetId} onChange={e=>setSpreadsheetId(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." autoComplete="off"/></label><label><span>매장 연결코드</span><input value={connectionCode} onChange={e=>setConnectionCode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&void connect()} placeholder="예: LOOP-CAFE-4821" autoComplete="off"/></label><button className="primary" disabled={busy} onClick={()=>void connect()}>{busy?'매장 확인 중...':'매장 연결하기'} <ArrowRight size={17}/></button>{error&&<div className="form-error">{error}</div>}<div className="connection-help">연결코드는 매장 관리자에게 문의해주세요.</div></div></div>
}

function StampCoupon({count,goal,rewardName,animate=false}:{count:number;goal:number;rewardName:string;animate?:boolean}){
  const completed=count>=goal
  const shown=Math.min(count,goal)
  return <div className={'stamp-coupon '+(completed?'complete ':'')+(animate?'stamp-pop':'')}>
    <div className="stamp-coupon-head">
      <div><span>LOOP STAMP</span><strong>{rewardName}</strong></div>
      <b>{shown} / {goal}</b>
    </div>
    <div className="stamp-slots">
      {Array.from({length:goal},(_,index)=><span key={index} className={index<shown?'filled':''}>{index<shown?'✓':''}</span>)}
    </div>
    <div className="stamp-coupon-foot">{completed?'쿠폰 완성! 직원 확인 후 혜택을 사용하세요.':`${goal-shown}번 더 방문하면 쿠폰이 완성돼요.`}</div>
  </div>
}

function ReturnReasonStep({reasons,busy,onSelect,onSkip,thanks}:{reasons:ReturnReason[];busy:boolean;onSelect:(reason:ReturnReason)=>void;onSkip:()=>void;thanks:string}){
  return <>
    <span className="step">다시 찾아주신 이유가 궁금해요</span>
    <h1>오늘은 왜 다시 들러주셨어요?</h1>
    <p>한 가지만 골라주시면 더 좋은 경험을 만드는 데 참고할게요.</p>
    {thanks?<div className="reason-thanks"><Sparkles size={18}/><strong>{thanks}</strong></div>:<div className="reason-grid">
      {reasons.slice(0,6).map(reason=><button key={reason.id} disabled={busy} className="reason-choice" onClick={()=>onSelect(reason)}>{reason.label}</button>)}
    </div>}
    {!thanks&&<button className="ghost reason-skip" disabled={busy} onClick={onSkip}>이번에는 건너뛰기</button>}
  </>
}

function Kiosk({rewards,paymentRewards,settings}:{rewards:Reward[];paymentRewards:Reward[];settings:EarningSettings}){
  const [step,setStep]=useState<KioskStep>('phone')
  const [phone,setPhone]=useState('')
  const [customer,setCustomer]=useState<KioskCustomer|null>(null)
  const [isNew,setIsNew]=useState(false)
  const [consent,setConsent]=useState(false)
  const [selectedSource,setSelectedSource]=useState<Source|undefined>()
  const [selectedReward,setSelectedReward]=useState<Reward|null>(null)
  const [pin,setPin]=useState('')
  const [paymentAmount,setPaymentAmount]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [completed,setCompleted]=useState<CompletedAction>(null)
  const [returnThanks,setReturnThanks]=useState('')
  const lock=useRef(false)

  const reset=()=>{
    setStep('phone');setPhone('');setCustomer(null);setIsNew(false);setConsent(false);setSelectedSource(undefined)
    setSelectedReward(null);setPin('');setPaymentAmount('');setBusy(false);setError('');setCompleted(null);setReturnThanks('');lock.current=false
  }
  useEffect(()=>{if(step!=='done')return;const timer=window.setTimeout(reset,12000);return()=>window.clearTimeout(timer)},[step])
  const request=async(payload:Record<string,unknown>)=>parseResponse(await fetch('/api/members',{method:'POST',headers:tenantHeaders({'Content-Type':'application/json'}),body:JSON.stringify(payload)}))
  const run=async(task:()=>Promise<void>)=>{
    if(lock.current)return
    lock.current=true;setBusy(true);setError('')
    try{await task()}catch(e){setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'))}finally{setBusy(false);lock.current=false}
  }

  const begin=()=>run(async()=>{
    const normalized=normalizePhone(phone)
    if(normalized.length<10)throw new Error('INVALID_PHONE')
    const data=await request({action:'lookup',phone:normalized})
    const found=(data.customer??null) as KioskCustomer|null
    setPhone(normalized);setCustomer(found);setIsNew(!found);setConsent(false);setReturnThanks('')
    setStep(found?.consentCurrent?'return-reason':'consent')
  })
  const continueConsent=()=>{
    if(!consent){setError('필수 동의 항목을 확인해주세요.');return}
    if(isNew){setError('');setStep('source');return}
    run(async()=>{
      const data=await request({action:'consent',phone,consent:true})
      setCustomer(data.customer as KioskCustomer);setStep('return-reason')
    })
  }
  const chooseSource=(source:Source)=>{
    setSelectedSource(source)
    if(settings.mode==='payment')setStep('payment')
    else void earn(source)
  }
  const chooseReturnReason=(reason:ReturnReason)=>run(async()=>{
    const data=await request({action:'returnReason',phone,reasonId:reason.id})
    setReturnThanks(String(data.thanks??reason.thanks))
    window.setTimeout(()=>{setReturnThanks('');setStep('action')},1050)
  })
  const earn=(source?:Source)=>run(async()=>{
    const amount=Number(paymentAmount.replace(/[^0-9]/g,''))
    const data=await request({
      action:'earn',phone,source:source??selectedSource,consent:isNew&&consent,
      paymentAmount:settings.mode==='payment'?amount:undefined,
    })
    setCustomer(data.customer as KioskCustomer);setCompleted('earn');setStep('done')
  })

  const activeRewards=(settings.mode==='payment'?paymentRewards:rewards).filter(reward=>reward.enabled)
  const balance=customer?modeBalance(customer,settings.mode):0
  const chooseReward=(reward:Reward)=>{
    if(customer&&balance>=reward.points&&reward.enabled){setSelectedReward(reward);setPin('');setError('');setStep('redeem-pin')}
  }
  const redeem=()=>{
    if(!selectedReward)return
    if(pin.length!==4){setError('직원 비밀번호 4자리를 입력해주세요.');return}
    run(async()=>{
      const data=await request({action:'redeem',phone,rewardId:selectedReward.id,pin})
      setCustomer(data.customer as KioskCustomer);setCompleted('redeem');setStep('done')
    })
  }
  const redeemStamp=()=>{
    if(pin.length!==4){setError('직원 비밀번호 4자리를 입력해주세요.');return}
    run(async()=>{
      const data=await request({action:'redeemStamp',phone,pin})
      setCustomer(data.customer as KioskCustomer);setCompleted('stamp-redeem');setStep('done')
    })
  }

  const visits=customer?.visits??0
  const tier=visits>=10?'vip':visits>=5?'regular':visits>=2?'returning':'first'
  const thanks=tier==='vip'?'오늘도 반가운 단골 고객님!':tier==='regular'?'꾸준히 찾아주셔서 정말 고마워요.':tier==='returning'?'다시 만나서 반가워요!':'첫 방문을 환영해요!'
  const TierIcon=tier==='vip'?Crown:tier==='regular'?Sparkles:Heart
  const paymentNumber=Number(paymentAmount.replace(/[^0-9]/g,''))||0
  const paymentPreview=Math.floor(paymentNumber*settings.paymentRate/100)
  const actionCopy=settings.mode==='visit'?'+1P 적립':settings.mode==='stamp'?'+1 도장':`결제금액의 ${settings.paymentRate}%`

  return <div className="kiosk" onClick={step==='done'?reset:undefined}>
    <div className={'kiosk-card '+(step==='done'?'celebrate '+tier:'')}>
      {step==='phone'&&<>
        <span className="step">LOOP 멤버십 · {MODE_COPY[settings.mode].label}</span>
        <h1>전화번호를 입력하고 멤버십을 확인하세요</h1>
        <p>방문 기록과 혜택을 빠르게 확인할 수 있어요. 처음 방문하셨다면 간단한 가입 절차가 이어집니다.</p>
        <input autoFocus autoComplete="off" className="phone-input" value={phone} onChange={e=>setPhone(e.target.value)} onKeyDown={e=>e.key==='Enter'&&begin()} placeholder="010 0000 0000" inputMode="numeric" aria-label="휴대전화번호"/>
        <div className="privacy-inline"><ShieldCheck size={14}/><span>입력한 번호는 가입 여부 확인에만 사용되며, 미가입 번호는 동의 전 저장하지 않습니다.</span></div>
        <button className="primary" disabled={busy} onClick={begin}>{busy?'확인 중...':'계속하기'} {!busy&&<ArrowRight size={17}/>}</button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='consent'&&<>
        <button className="ghost back" disabled={busy} onClick={reset}><ChevronLeft size={15}/> 번호 다시 입력</button>
        <span className="step">개인정보 확인</span>
        <h1>멤버십 이용을 위해 한 번만 확인해주세요</h1>
        <p>현재 동의 문안에 동의한 기록이 없는 고객에게만 표시됩니다.</p>
        <label className={'consent-box '+(consent?'checked':'')}>
          <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span className="fake-check">{consent&&<Check size={15}/>}</span>
          <span><strong>[필수] 개인정보 수집·이용에 동의합니다.</strong><small>휴대전화번호를 멤버십 식별 및 포인트·도장 관리에 이용합니다.</small></span>
        </label>
        <details className="privacy-details"><summary>개인정보 수집·이용 안내 자세히 보기</summary><dl>
          <div><dt>수집·이용 목적</dt><dd>멤버십 고객 식별, 방문 및 포인트·도장 적립·사용 관리</dd></div>
          <div><dt>수집 항목</dt><dd>휴대전화번호</dd></div>
          <div><dt>보유·이용 기간</dt><dd>회원 탈퇴 또는 동의 철회 시까지. 관계 법령상 보존 의무가 있는 경우 해당 기간 동안 분리 보관합니다.</dd></div>
          <div><dt>동의 거부 권리</dt><dd>동의를 거부할 수 있으나 멤버십 서비스 이용이 제한될 수 있습니다.</dd></div>
        </dl><p className="privacy-help">개인정보 삭제·동의 철회는 매장 관리자에게 요청할 수 있습니다. 만 14세 미만 고객은 법정대리인 동의가 필요합니다.</p></details>
        <button className="primary" disabled={!consent||busy} onClick={continueConsent}>{busy?'저장 중...':'동의하고 계속하기'} <ArrowRight size={17}/></button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='source'&&<>
        <button className="ghost back" disabled={busy} onClick={()=>setStep('consent')}><ChevronLeft size={15}/> 이전</button>
        <span className="step">처음 오셨군요 · 마지막 단계</span>
        <h1>어디에서 알고 오셨어요?</h1>
        <p>유입경로는 매장 마케팅 개선을 위한 통계로 활용돼요.</p>
        <div className="choices">{SOURCES.map(source=><button className="choice" disabled={busy} key={source} onClick={()=>chooseSource(source)}>{source}</button>)}</div>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='return-reason'&&customer&&<ReturnReasonStep reasons={settings.returnReasons} busy={busy} thanks={returnThanks} onSelect={chooseReturnReason} onSkip={()=>setStep('action')}/>} 

      {step==='action'&&customer&&<>
        <button className="ghost back" onClick={reset}><ChevronLeft size={15}/> 다른 번호 입력</button>
        <span className="step">{customer.visits}회 방문 · {MODE_COPY[settings.mode].label}</span>
        <h1>현재 <em>{balance}{modeUnit(settings.mode)}</em>가 쌓여 있어요</h1>
        <p>다시 찾아주셔서 반가워요. 오늘은 무엇을 도와드릴까요?</p>
        {settings.mode==='stamp'&&<StampCoupon count={customer.stamps} goal={settings.stampGoal} rewardName={settings.stampRewardName}/>} 
        <div className="action-grid mode-actions">
          <button className="action-card earn" disabled={busy} onClick={()=>settings.mode==='payment'?setStep('payment'):void earn()}><Sparkles size={25}/><strong>{settings.mode==='stamp'?'도장 찍기':'적립하기'}</strong><span>{actionCopy}</span></button>
          {settings.mode==='stamp'
            ?<button className="action-card redeem" disabled={busy||customer.stamps<settings.stampGoal} onClick={()=>{setPin('');setError('');setStep('stamp-pin')}}><Gift size={25}/><strong>쿠폰 사용</strong><span>{customer.stamps>=settings.stampGoal?settings.stampRewardName:`${settings.stampGoal-customer.stamps}개 더 필요`}</span></button>
            :<button className="action-card redeem" disabled={busy||!activeRewards.length} onClick={()=>setStep('rewards')}><Gift size={25}/><strong>포인트 사용</strong><span>혜택으로 교환하기</span></button>}
        </div>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='payment'&&<>
        <button className="ghost back" disabled={busy} onClick={()=>setStep(isNew?'source':'action')}><ChevronLeft size={15}/> 이전</button>
        <span className="step">결제금액 포인트 · {settings.paymentRate}%</span>
        <h1>결제금액을 입력해주세요</h1>
        <p>결제금액 기준으로 적립 예정 포인트를 바로 계산해드려요.</p>
        <label className="payment-input-wrap"><input autoFocus inputMode="numeric" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value.replace(/\D/g,''))} placeholder="0"/><span>원</span></label>
        <div className="payment-preview"><span>{money(paymentNumber)}원 × {settings.paymentRate}%</span><strong>{money(paymentPreview)} P 적립 예정</strong></div>
        <button className="primary" disabled={busy||paymentPreview<1} onClick={()=>earn()}>{busy?'적립 중...':'포인트 적립 확정'} <ArrowRight size={17}/></button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='rewards'&&customer&&<>
        <button className="ghost back" onClick={()=>setStep('action')}><ChevronLeft size={15}/> 이전</button>
        <span className="step">보유 {MODE_COPY[settings.mode].short} {balance}P</span>
        <h1>사용할 혜택을 선택해주세요</h1>
        <p>포인트가 부족한 혜택은 자동으로 비활성화됩니다.</p>
        <div className="reward-list">{activeRewards.length?activeRewards.map(reward=>{
          const available=balance>=reward.points
          return <button key={reward.id} className="reward-choice" disabled={!available} onClick={()=>chooseReward(reward)}><span><strong>{reward.name}</strong><small>{available?'지금 사용할 수 있어요':`${reward.points-balance}P 더 필요해요`}</small></span><b>{reward.points}P</b></button>
        }):<div className="empty-state">현재 사용할 수 있는 혜택이 없습니다.</div>}</div>
      </>}

      {step==='redeem-pin'&&selectedReward&&<>
        <button className="ghost back" disabled={busy} onClick={()=>{setStep('rewards');setPin('');setError('')}}><ChevronLeft size={15}/> 혜택 다시 선택</button>
        <div className="success-icon secure"><LockKeyhole size={31}/></div>
        <h1>직원 확인이 필요해요</h1>
        <p><strong>{selectedReward.name}</strong> · {selectedReward.points}P 사용. 직원이 관리자 비밀번호를 입력하면 완료됩니다.</p>
        <input autoFocus className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e=>e.key==='Enter'&&redeem()} placeholder="••••" aria-label="직원 비밀번호"/>
        <button className="primary" disabled={busy||pin.length!==4} onClick={redeem}>{busy?'확인 중...':'포인트 사용 확정'} <Check size={17}/></button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='stamp-pin'&&customer&&<>
        <button className="ghost back" disabled={busy} onClick={()=>{setStep('action');setPin('');setError('')}}><ChevronLeft size={15}/> 이전</button>
        <StampCoupon count={customer.stamps} goal={settings.stampGoal} rewardName={settings.stampRewardName}/>
        <h1>완성 쿠폰을 사용할까요?</h1>
        <p><strong>{settings.stampRewardName}</strong> 혜택을 적용하려면 직원 비밀번호를 입력해주세요.</p>
        <input autoFocus className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e=>e.key==='Enter'&&redeemStamp()} placeholder="••••" aria-label="직원 비밀번호"/>
        <button className="primary" disabled={busy||pin.length!==4} onClick={redeemStamp}>{busy?'확인 중...':'쿠폰 사용 확정'} <Check size={17}/></button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='done'&&customer&&<>
        <div className="success-icon">{completed==='redeem'||completed==='stamp-redeem'?<Gift size={34}/>:<TierIcon size={36}/>}</div>
        <h1>{completed==='redeem'||completed==='stamp-redeem'?'혜택 사용이 완료됐어요!':thanks}</h1>
        <p>{completed==='redeem'?`${selectedReward?.name??''} 혜택을 적용했어요.`:completed==='stamp-redeem'?`${settings.stampRewardName} 혜택을 적용했어요.`:`${customer.visits}번째 방문을 기록했어요. 오늘도 찾아주셔서 감사합니다.`}</p>
        {settings.mode==='stamp'?<StampCoupon count={customer.stamps} goal={settings.stampGoal} rewardName={settings.stampRewardName} animate={completed==='earn'}/>:<div className="reward"><span>{completed==='redeem'?'사용 후 잔액':'현재 잔액'}</span><strong>{modeBalance(customer,settings.mode)} P</strong></div>}
        <div className="auto-reset">잠시 후 다음 고객 화면으로 돌아갑니다<span>화면을 누르면 바로 시작할 수 있어요</span></div>
      </>}
      <div className="demo-note">LOOP 멤버십 · 개인정보는 멤버십 서비스 운영 목적으로만 처리합니다.</div>
    </div>
  </div>
}

function CustomerDetailModal({customer,pin,onClose,onCustomerChange}:{customer:AdminCustomer;pin:string;onClose:()=>void;onCustomerChange:(customer:AdminCustomer)=>void}){
  const [detail,setDetail]=useState<AdminCustomerDetail|null>(null)
  const [targetPoints,setTargetPoints]=useState(String(customer.points))
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    setLoading(true);setError('');setDetail(null);setTargetPoints(String(customer.points))
    fetch('/api/members',{method:'POST',headers:tenantHeaders({'Content-Type':'application/json'}),body:JSON.stringify({action:'detail',customerId:customer.id,pin})})
      .then(parseResponse)
      .then(data=>{if(!active)return;const next={customer:data.customer as AdminCustomer,transactions:(data.transactions??[]) as AdminTransaction[]};setDetail(next);setTargetPoints(String(next.customer.points))})
      .catch(e=>active&&setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED')))
      .finally(()=>active&&setLoading(false))
    return()=>{active=false}
  },[customer.id,customer.points,pin])
  const target=targetPoints.trim()===''?NaN:Number(targetPoints)
  const valid=Number.isInteger(target)&&target>=0
  const delta=detail&&valid?target-detail.customer.points:0
  const adjust=async()=>{
    if(!detail||!valid||delta===0)return
    setSaving(true);setError('')
    try{
      const data=await parseResponse(await fetch('/api/members',{method:'POST',headers:tenantHeaders({'Content-Type':'application/json'}),body:JSON.stringify({action:'adjust',customerId:detail.customer.id,targetPoints:target,pin})}))
      const next={customer:data.customer as AdminCustomer,transactions:(data.transactions??[]) as AdminTransaction[]}
      setDetail(next);setTargetPoints(String(next.customer.points));onCustomerChange(next.customer)
    }catch(e){setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'))}finally{setSaving(false)}
  }
  return <div className="modal-backdrop customer-detail-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="customer-detail-modal">
      <header className="detail-modal-header"><div><span className="step">고객 상세</span><h2>{customer.phoneMasked}</h2><p>적립 방식별 잔액은 서로 분리되어 보존됩니다.</p></div><button className="modal-close" onClick={onClose} aria-label="닫기"><X size={18}/></button></header>
      {loading?<div className="detail-loading">포인트 내역을 불러오고 있습니다.</div>:error&&!detail?<div className="form-error detail-error">{error}</div>:detail&&<>
        <div className="detail-summary detail-summary-modes">
          <div className="detail-summary-main"><span>방문 포인트</span><strong>{detail.customer.points} P</strong></div>
          <div><span>도장</span><strong>{detail.customer.stamps}개</strong></div>
          <div><span>결제 포인트</span><strong>{detail.customer.paymentPoints} P</strong></div>
          <div><span>방문</span><strong>{detail.customer.visits}회</strong></div>
          <div><span>최근 방문</span><strong>{detail.customer.lastVisit||'-'}</strong></div>
          <div><span>유입경로</span><strong>{detail.customer.source??'기존 고객'}</strong></div>
        </div>
        <div className="point-adjust-card">
          <div className="point-adjust-copy"><strong>방문 포인트 수정</strong><span>기존 1P 방식 잔액만 수정하며 도장·결제 포인트에는 영향을 주지 않습니다.</span></div>
          <div className="point-adjust-controls"><label className="admin-points-input"><input type="number" min={0} step={1} value={targetPoints} onChange={e=>{setTargetPoints(e.target.value);setError('')}} aria-label="수정할 최종 포인트"/><span>P</span></label><button className="save-button point-adjust-button" disabled={saving||!valid||delta===0} onClick={adjust}><Save size={15}/>{saving?'수정 중...':'포인트 수정'}</button></div>
          <div className={'adjust-preview '+(delta>0?'positive':delta<0?'negative':'')}>{valid?(delta===0?'변경 없음':`현재보다 ${delta>0?'+':''}${delta}P`):'0 이상의 정수를 입력해주세요.'}</div>{error&&<div className="form-error">{error}</div>}
        </div>
        <div className="history-section"><div className="history-title"><span><History size={17}/> 방문 포인트 전체 내역</span><span className="pill">{detail.transactions.length}건</span></div>{detail.transactions.length?<div className="transaction-list">{detail.transactions.map((transaction,index)=><div className="transaction-row" key={`${transaction.date}-${transaction.type}-${index}`}><div className={'transaction-type '+transaction.type.toLowerCase()}>{transactionLabel(transaction.type)}</div><div className="transaction-copy"><strong>{transaction.description}</strong><span>{formatTransactionDate(transaction.date)} · 변경 전 {transaction.balanceBefore}P → 변경 후 {transaction.balanceAfter}P</span></div><div className="transaction-amount"><strong className={transaction.delta>=0?'positive':'negative'}>{transaction.delta>0?'+':''}{transaction.delta}P</strong><span>잔액 {transaction.balanceAfter}P</span></div></div>)}</div>:<div className="empty-state">기록된 포인트 내역이 없습니다.</div>}</div>
      </>}
    </section>
  </div>
}

function LineChart({series}:{series:AnalyticsPoint[]}){
  if(!series.length)return <div className="analytics-empty">아직 그래프로 표시할 기록이 없습니다.</div>
  const width=640,height=230,padX=34,padY=26
  const values=series.map(point=>point.value)
  const max=Math.max(...values,1),min=Math.min(...values,0),span=Math.max(max-min,1)
  const coords=series.map((point,index)=>({
    x:series.length===1?width/2:padX+(index/(series.length-1))*(width-padX*2),
    y:padY+(1-(point.value-min)/span)*(height-padY*2),
    ...point,
  }))
  const points=coords.map(point=>`${point.x},${point.y}`).join(' ')
  const area=`${padX},${height-padY} ${points} ${width-padX},${height-padY}`
  return <div className="line-chart-wrap">
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="날짜별 추이 선 그래프">
      <line x1={padX} y1={height-padY} x2={width-padX} y2={height-padY} className="chart-axis"/>
      <polygon points={area} className="chart-area"/>
      <polyline points={points} className="chart-line"/>
      {coords.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r="4" className="chart-dot"><title>{point.date} · {point.value}</title></circle>)}
    </svg>
    <div className="chart-labels"><span>{series[0]?.date}</span><span>{series[Math.floor(series.length/2)]?.date}</span><span>{series.at(-1)?.date}</span></div>
  </div>
}

function AnalyticsModal({metric,onClose}:{metric:AnalyticsMetric;onClose:()=>void}){
  const [range,setRange]=useState<'30'|'90'|'all'>('30')
  const filtered=useMemo(()=>{
    if(range==='all'||metric.series.length<2)return metric.series
    const last=new Date(metric.series.at(-1)?.date??'')
    if(Number.isNaN(last.getTime()))return metric.series
    const cutoff=new Date(last);cutoff.setDate(cutoff.getDate()-(Number(range)-1))
    return metric.series.filter(point=>new Date(point.date)>=cutoff)
  },[metric.series,range])
  const first=filtered[0]?.value??metric.current,last=filtered.at(-1)?.value??metric.current
  const change=last-first
  return <div className="modal-backdrop analytics-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <section className="analytics-modal">
      <header className="analytics-head"><div><span className="step">날짜별 데이터</span><h2>{metric.label}</h2><p>{metric.note}</p></div><button className="modal-close" onClick={onClose}><X size={18}/></button></header>
      <div className="analytics-summary"><div><span>현재</span><strong>{money(metric.current)} {metric.unit}</strong></div><div><span>선택 구간 변화</span><strong className={change>=0?'positive':'negative'}>{change>0?'+':''}{money(change)} {metric.unit}</strong></div></div>
      <div className="range-tabs"><button className={range==='30'?'active':''} onClick={()=>setRange('30')}>30일</button><button className={range==='90'?'active':''} onClick={()=>setRange('90')}>90일</button><button className={range==='all'?'active':''} onClick={()=>setRange('all')}>전체</button></div>
      <LineChart series={filtered}/>
    </section>
  </div>
}

function PaymentExitWarning({total,onCancel,onConfirm}:{total:number;onCancel:()=>void;onConfirm:()=>void}){
  const [checked,setChecked]=useState(false)
  return <div className="modal-backdrop warning-backdrop"><section className="mode-warning-modal">
    <div className="warning-icon">!</div><h2>결제 포인트가 남아 있습니다</h2>
    <p>현재 고객에게 <strong>{money(total)}P</strong>의 결제금액 포인트가 남아 있습니다. 적립 방식을 변경해도 삭제되지는 않지만 방문 포인트·도장으로 자동 환산되거나 합쳐지지 않습니다.</p>
    <div className="warning-note">나중에 결제금액 적립 방식으로 다시 돌아오면 기존 잔액에서 그대로 이어집니다.</div>
    <label className="warning-check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>위 내용을 확인했습니다.</span></label>
    <div className="warning-actions"><button className="ghost" onClick={onCancel}>취소</button><button className="save-button" disabled={!checked} onClick={onConfirm}>적립 방식 변경</button></div>
  </section></div>
}

function Dashboard({customers,bundle,pin,onBundleSaved,onCustomersChange}:{customers:AdminCustomer[];bundle:SettingsBundle;pin:string;onBundleSaved:(bundle:SettingsBundle)=>void;onCustomersChange:(customers:AdminCustomer[])=>void}){
  const [visitRewards,setVisitRewards]=useState<Reward[]>(bundle.rewards)
  const [paymentRewards,setPaymentRewards]=useState<Reward[]>(bundle.paymentRewards)
  const [settings,setSettings]=useState<EarningSettings>(bundle.earningSettings)
  const [saving,setSaving]=useState(false)
  const [status,setStatus]=useState('')
  const [selectedCustomer,setSelectedCustomer]=useState<AdminCustomer|null>(null)
  const [analytics,setAnalytics]=useState<AnalyticsBundle|null>(null)
  const [analyticsKey,setAnalyticsKey]=useState<AnalyticsKey|null>(null)
  const [analyticsLoading,setAnalyticsLoading]=useState(false)
  const [showPaymentWarning,setShowPaymentWarning]=useState(false)

  useEffect(()=>{setVisitRewards(bundle.rewards);setPaymentRewards(bundle.paymentRewards);setSettings(bundle.earningSettings)},[bundle])
  const total=customers.length
  const visits=customers.reduce((sum,customer)=>sum+customer.visits,0)
  const repeat=customers.filter(customer=>customer.visits>1).length
  const activeTotal=customers.reduce((sum,customer)=>sum+modeBalance(customer,settings.mode),0)
  const counts=SOURCES.map(source=>({source,count:customers.filter(customer=>customer.source===source).length}))
  const max=Math.max(...counts.map(item=>item.count),1)
  const paymentOutstanding=customers.reduce((sum,customer)=>sum+customer.paymentPoints,0)

  const activeRewardDraft=settings.mode==='payment'?paymentRewards:visitRewards
  const setActiveRewardDraft=(next:Reward[])=>settings.mode==='payment'?setPaymentRewards(next):setVisitRewards(next)
  const updateReward=(id:string,patch:Partial<Reward>)=>setActiveRewardDraft(activeRewardDraft.map(reward=>reward.id===id?{...reward,...patch}:reward))

  const updateReason=(id:string,patch:Partial<ReturnReason>)=>setSettings(current=>({...current,returnReasons:current.returnReasons.map(reason=>reason.id===id?{...reason,...patch}:reason)}))
  const selectIndustry=(industry:IndustryPreset)=>{
    const reasons=industry==='custom'?settings.returnReasons:RETURN_REASON_PRESETS[industry].map(reason=>({...reason}))
    setSettings(current=>({...current,industry,returnReasons:reasons.slice(0,6)}))
  }
  const addReason=()=>setSettings(current=>current.returnReasons.length>=6?current:{...current,returnReasons:[...current.returnReasons,{id:crypto.randomUUID(),label:'새 재방문 이유',thanks:'다시 찾아주셔서 감사합니다.'}]})

  const doSave=async(confirmPaymentModeExit=false)=>{
    if(activeRewardDraft.some(reward=>!reward.name.trim()||!Number.isInteger(Number(reward.points))||Number(reward.points)<1)){setStatus('혜택명과 1P 이상의 정수 포인트를 확인해주세요.');return}
    if(settings.returnReasons.some(reason=>!reason.label.trim()||!reason.thanks.trim())||settings.returnReasons.length>6){setStatus('재방문 설문은 1~6개의 문항과 감사 문구를 모두 입력해주세요.');return}
    setSaving(true);setStatus('')
    try{
      const data=await parseResponse(await fetch('/api/settings',{method:'PUT',headers:tenantHeaders({'Content-Type':'application/json'}),body:JSON.stringify({pin,rewards:visitRewards,paymentRewards,earningSettings:settings,confirmPaymentModeExit})}))
      const next={rewards:data.rewards as Reward[],paymentRewards:data.paymentRewards as Reward[],earningSettings:data.earningSettings as EarningSettings}
      onBundleSaved(next);setStatus('적립 방식과 혜택 설정을 저장했습니다.');setShowPaymentWarning(false);setAnalytics(null)
    }catch(e){
      const code=e instanceof Error?e.message:'REQUEST_FAILED'
      if(code==='PAYMENT_MODE_EXIT_CONFIRM_REQUIRED'){setShowPaymentWarning(true);setStatus('')}
      else setStatus(errorMessage(code))
    }finally{setSaving(false)}
  }
  const save=()=>{
    if(bundle.earningSettings.mode==='payment'&&settings.mode!=='payment'&&paymentOutstanding>0){setShowPaymentWarning(true);return}
    void doSave(false)
  }

  const removeCustomer=async(customer:AdminCustomer)=>{
    if(!window.confirm(`${customer.phoneMasked} 고객의 멤버십 정보와 모든 적립 기록을 삭제할까요?\n삭제 후 복구할 수 없습니다.`))return
    setStatus('')
    try{
      await parseResponse(await fetch('/api/members',{method:'POST',headers:tenantHeaders({'Content-Type':'application/json'}),body:JSON.stringify({action:'delete',customerId:customer.id,pin})}))
      onCustomersChange(customers.filter(item=>item.id!==customer.id));if(selectedCustomer?.id===customer.id)setSelectedCustomer(null);setStatus('고객 개인정보와 관련 기록을 삭제했습니다.');setAnalytics(null)
    }catch(e){setStatus(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'))}
  }
  const updateCustomer=(customer:AdminCustomer)=>{onCustomersChange(customers.map(item=>item.id===customer.id?customer:item));setSelectedCustomer(customer);setAnalytics(null)}

  const openAnalytics=async(key:AnalyticsKey)=>{
    setAnalyticsKey(key)
    if(analytics)return
    setAnalyticsLoading(true)
    try{const data=await parseResponse(await fetch('/api/analytics',{headers:tenantHeaders({'x-admin-pin':pin}),cache:'no-store'}));setAnalytics(data.analytics as AnalyticsBundle)}catch(e){setStatus(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'));setAnalyticsKey(null)}finally{setAnalyticsLoading(false)}
  }

  return <>
    <main className="main">
      <div className="hero"><div><div className="eyebrow">Member intelligence</div><h1 className="title">고객이 다시 오는 이유를 매일 확인하세요.</h1><div className="sub">멤버십 현황, 유입경로, 적립 방식과 혜택을 한곳에서 관리합니다.</div></div><div className="admin-badge"><LockKeyhole size={14}/> 관리자 인증됨</div></div>

      <div className="grid analytics-grid">
        <button className="stat stat-button" onClick={()=>void openAnalytics('customers')}><div className="stat-label">전체 고객</div><div className="stat-value">{total}</div><div className="stat-note">눌러서 날짜별 추이 보기</div></button>
        <button className="stat stat-button" onClick={()=>void openAnalytics('visits')}><div className="stat-label">누적 방문</div><div className="stat-value">{visits}</div><div className="stat-note">눌러서 날짜별 방문 보기</div></button>
        <button className="stat stat-button" onClick={()=>void openAnalytics('repeat')}><div className="stat-label">재방문 고객</div><div className="stat-value">{repeat}</div><div className="stat-note">전체의 {total?Math.round(repeat/total*100):0}% · 추이 보기</div></button>
        <button className="stat stat-button" onClick={()=>void openAnalytics('balance')}><div className="stat-label">{settings.mode==='stamp'?'보유 도장 합계':settings.mode==='payment'?'결제 포인트 합계':'보유 포인트 합계'}</div><div className="stat-value">{money(activeTotal)} {modeUnit(settings.mode)}</div><div className="stat-note">{MODE_COPY[settings.mode].label} 기준 · 추이 보기</div></button>
      </div>

      <section className="panel earning-settings-panel">
        <div className="panel-title"><span>적립 방식 설정</span><span className="pill">현재 · {MODE_COPY[bundle.earningSettings.mode].label}</span></div>
        <div className="mode-picker">{(['visit','stamp','payment'] as EarningMode[]).map(mode=><button key={mode} className={'mode-card '+(settings.mode===mode?'selected':'')} onClick={()=>setSettings(current=>({...current,mode}))}><span className="mode-icon">{MODE_COPY[mode].emoji}</span><strong>{MODE_COPY[mode].label}</strong><small>{MODE_COPY[mode].description}</small>{settings.mode===mode&&<span className="mode-selected"><Check size={13}/> 선택됨</span>}</button>)}</div>
        <div className="mode-config">
          {settings.mode==='visit'&&<div className="config-callout"><strong>방문 1회 = 1P</strong><span>기존 포인트와 혜택을 그대로 이어서 사용합니다.</span></div>}
          {settings.mode==='stamp'&&<div className="config-grid"><label><span>쿠폰 완성 도장 수</span><div className="inline-number"><input type="number" min={2} max={30} value={settings.stampGoal} onChange={e=>setSettings(current=>({...current,stampGoal:Number(e.target.value)}))}/><b>개</b></div></label><label><span>완성 쿠폰 혜택</span><input value={settings.stampRewardName} onChange={e=>setSettings(current=>({...current,stampRewardName:e.target.value}))}/></label></div>}
          {settings.mode==='payment'&&<div className="config-grid payment-config"><label><span>결제금액 적립률</span><div className="inline-number"><input type="number" min={0.1} max={100} step={0.1} value={settings.paymentRate} onChange={e=>setSettings(current=>({...current,paymentRate:Number(e.target.value)}))}/><b>%</b></div></label><div className="config-callout"><strong>예: 32,000원 결제 시 {money(Math.floor(32000*settings.paymentRate/100))}P</strong><span>1P 미만 소수점은 자동으로 버립니다.</span></div></div>}
        </div>
      </section>

      <section className="panel return-survey-panel">
        <div className="panel-title"><span>재방문 이유 설문</span><span className="pill">최대 6개</span></div>
        <div className="survey-toolbar"><label><span>업종 프리셋</span><select value={settings.industry} onChange={e=>selectIndustry(e.target.value as IndustryPreset)}>{Object.entries(INDUSTRY_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="mini-button" disabled={settings.returnReasons.length>=6} onClick={addReason}><Plus size={14}/> 문항 추가</button></div>
        <div className="survey-editor">{settings.returnReasons.map((reason,index)=><div className="survey-row" key={reason.id}><div className="survey-index">{index+1}</div><label><span>선택 문구</span><input value={reason.label} onChange={e=>updateReason(reason.id,{label:e.target.value})}/></label><label className="thanks-field"><span>선택 후 감사 문구</span><input value={reason.thanks} onChange={e=>updateReason(reason.id,{thanks:e.target.value})}/></label><button className="icon-button danger" disabled={settings.returnReasons.length===1} onClick={()=>setSettings(current=>({...current,returnReasons:current.returnReasons.filter(item=>item.id!==reason.id)}))}><Trash2 size={15}/></button></div>)}</div>
        <div className="survey-hint">재방문 고객에게만 한 번 보여주며, 고객은 작게 표시된 ‘건너뛰기’를 선택할 수 있습니다.</div>
      </section>

      {settings.mode!=='stamp'&&<section className="panel reward-admin">
        <div className="panel-title"><span>{settings.mode==='payment'?'결제 포인트 혜택':'방문 포인트 혜택'} 설정</span><button className="mini-button" onClick={()=>setActiveRewardDraft([...activeRewardDraft,{id:crypto.randomUUID(),name:'새 혜택',points:settings.mode==='payment'?1000:10,enabled:true}])}><Plus size={14}/> 혜택 추가</button></div>
        <div className="reward-admin-list">{activeRewardDraft.map(reward=><div className="reward-admin-row" key={reward.id}><label className="reward-enabled"><input type="checkbox" checked={reward.enabled} onChange={e=>updateReward(reward.id,{enabled:e.target.checked})}/><span>{reward.enabled?'사용':'중지'}</span></label><input className="reward-name-input" value={reward.name} onChange={e=>updateReward(reward.id,{name:e.target.value})} aria-label="혜택명"/><div className="points-input-wrap"><input type="number" min={1} step={1} value={reward.points} onChange={e=>updateReward(reward.id,{points:Number(e.target.value)})} aria-label="필요 포인트"/><span>P</span></div><button className="icon-button danger" disabled={activeRewardDraft.length===1} onClick={()=>setActiveRewardDraft(activeRewardDraft.filter(item=>item.id!==reward.id))} aria-label="혜택 삭제"><Trash2 size={16}/></button></div>)}</div>
      </section>}

      <div className="settings-savebar"><span className={status.includes('했습니다')?'save-status success':'save-status'}>{status}</span><button className="save-button settings-main-save" disabled={saving} onClick={save}><Save size={16}/>{saving?'저장 중...':'전체 설정 저장'}</button></div>

      <div className="dash-grid"><section className="panel"><div className="panel-title">고객 유입경로 <span className="pill">신규</span></div>{counts.map(item=><div className="source-row" key={item.source}><div className="source-name">{item.source}</div><div className="track"><div className="fill" style={{width:(item.count/max*100)+'%'}}/></div><div className="source-pct">{item.count}명</div></div>)}</section><section className="panel privacy-panel"><div className="panel-title">개인정보 운영 기준 <span className="pill"><ShieldCheck size={13}/> 보호</span></div><ul><li>관리자 화면에도 전체 전화번호를 전송하지 않고 마스킹</li><li>미가입 번호는 동의 전 저장하지 않음</li><li>적립 방식별 원장을 별도 시트로 분리</li><li>삭제 요청 시 새 원장을 포함한 관련 기록 함께 삭제</li></ul><div className="privacy-version">동의 문안 버전 · 2026-09-01-v1</div></section></div>

      <section className="panel customer-panel"><div className="panel-title">최근 고객 <span className="pill"><Users size={13}/> {total}명</span></div>{customers.length?customers.slice().reverse().map(customer=><div className="customer-row interactive" key={customer.id} role="button" tabIndex={0} onClick={()=>setSelectedCustomer(customer)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedCustomer(customer)}}}><div className="customer-main"><div className="avatar">••</div><div><div className="customer-name">{customer.phoneMasked}</div><div className="customer-meta">{customer.source??'기존 고객'} · {customer.visits}회 · P {customer.points} · 도장 {customer.stamps} · 결제P {customer.paymentPoints}</div></div></div><div className="customer-actions"><div className="customer-points">{modeBalance(customer,settings.mode)} {modeUnit(settings.mode)}</div><button className="icon-button danger" onClick={e=>{e.stopPropagation();void removeCustomer(customer)}} aria-label="고객 개인정보 삭제"><Trash2 size={15}/></button></div></div>):<div className="empty-state">등록된 고객이 없습니다.</div>}</section>
    </main>
    {selectedCustomer&&<CustomerDetailModal customer={selectedCustomer} pin={pin} onClose={()=>setSelectedCustomer(null)} onCustomerChange={updateCustomer}/>} 
    {analyticsKey&&(analytics||analyticsLoading)&&<>{analyticsLoading&&!analytics?<div className="modal-backdrop analytics-backdrop"><div className="analytics-loading">데이터를 정리하고 있습니다.</div></div>:analytics&&<AnalyticsModal metric={analytics[analyticsKey]} onClose={()=>setAnalyticsKey(null)}/>}</>}
    {showPaymentWarning&&<PaymentExitWarning total={paymentOutstanding} onCancel={()=>setShowPaymentWarning(false)} onConfirm={()=>void doSave(true)}/>} 
  </>
}

function AdminLogin({open,onClose,onSuccess}:{open:boolean;onClose:()=>void;onSuccess:(pin:string,customers:AdminCustomer[])=>void}){
  const [pin,setPin]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{if(open){setPin('');setError('')}},[open])
  if(!open)return null
  const submit=async()=>{
    if(pin.length!==4){setError('관리자 비밀번호 4자리를 입력해주세요.');return}
    setBusy(true);setError('')
    try{const data=await parseResponse(await fetch('/api/members',{headers:tenantHeaders({'x-admin-pin':pin}),cache:'no-store'}));onSuccess(pin,data.customers as AdminCustomer[])}catch(e){setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'));setPin('')}finally{setBusy(false)}
  }
  return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="admin-login"><div className="success-icon secure"><LockKeyhole size={30}/></div><h2>관리자 확인</h2><p>고객 정보와 적립 설정을 보호하기 위해 관리자 비밀번호가 필요합니다.</p><input autoFocus className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="••••"/><button className="primary" disabled={busy||pin.length!==4} onClick={submit}>{busy?'확인 중...':'관리자 모드 열기'}</button>{error&&<div className="form-error">{error}</div>}<button className="ghost" onClick={onClose}>취소</button></div></div>
}

export default function Home(){
  const [mode,setMode]=useState<'kiosk'|'dashboard'>('kiosk')
  const [deviceSession,setDeviceSession]=useState<DeviceSession|null>(null)
  const [ready,setReady]=useState(false)
  const [connectRequired,setConnectRequired]=useState(false)
  const [customers,setCustomers]=useState<AdminCustomer[]>([])
  const [bundle,setBundle]=useState<SettingsBundle>({
    rewards:FALLBACK_REWARDS,
    paymentRewards:FALLBACK_PAYMENT_REWARDS,
    earningSettings:{...DEFAULT_EARNING_SETTINGS,returnReasons:DEFAULT_EARNING_SETTINGS.returnReasons.map(reason=>({...reason}))},
  })
  const [adminPin,setAdminPin]=useState('')
  const [adminLogin,setAdminLogin]=useState(false)
  useEffect(()=>{
    const session=loadDeviceSession()
    setDeviceSession(session)
    setConnectRequired(!session&&new URLSearchParams(window.location.search).get('loop-connect')==='1')
    setReady(true)
  },[])
  useEffect(()=>{
    if(!ready||connectRequired)return
    fetch('/api/settings',{headers:tenantHeaders({},deviceSession?.token),cache:'no-store'}).then(parseResponse).then(data=>{
      setBundle({
        rewards:(data.rewards as Reward[]|undefined)??FALLBACK_REWARDS,
        paymentRewards:(data.paymentRewards as Reward[]|undefined)??FALLBACK_PAYMENT_REWARDS,
        earningSettings:(data.earningSettings as EarningSettings|undefined)??DEFAULT_EARNING_SETTINGS,
      })
    }).catch(()=>{})
  },[ready,connectRequired,deviceSession?.token])
  const backToKiosk=()=>{setMode('kiosk');setAdminPin('');setCustomers([])}
  if(!ready)return <div className="connection-page"><div className="connection-card"><div className="connection-mark">L</div><h1>LOOP를 준비하고 있어요.</h1></div></div>
  if(connectRequired)return <StoreConnection onConnected={session=>{setDeviceSession(session);setConnectRequired(false);window.history.replaceState({},'',window.location.pathname)}}/>
  return <div className="shell"><header className="topbar"><div className="brand"><div className="mark">L</div> LOOP{deviceSession&&<small className="store-label">· {deviceSession.appName}</small>}</div><div className="switcher"><button className={mode==='kiosk'?'active':''} onClick={backToKiosk}>고객 화면</button><button className={mode==='dashboard'?'active':''} onClick={()=>setAdminLogin(true)}><LockKeyhole size={13}/> 관리자 보기</button></div></header>{mode==='kiosk'?<Kiosk rewards={bundle.rewards} paymentRewards={bundle.paymentRewards} settings={bundle.earningSettings}/>:<Dashboard customers={customers} bundle={bundle} pin={adminPin} onBundleSaved={setBundle} onCustomersChange={setCustomers}/>}<AdminLogin open={adminLogin} onClose={()=>setAdminLogin(false)} onSuccess={(pin,list)=>{setAdminPin(pin);setCustomers(list);setMode('dashboard');setAdminLogin(false)}}/></div>
}
