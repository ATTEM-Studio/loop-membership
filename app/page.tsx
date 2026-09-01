'use client'

import {useEffect, useRef, useState} from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Crown,
  Gift,
  Heart,
  LockKeyhole,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react'
import {
  SOURCES,
  hasCurrentPrivacyConsent,
  maskPhone,
  normalizePhone,
  type Customer,
  type Reward,
  type Source,
} from '../lib/domain'

const FALLBACK_REWARDS:Reward[]=[
  {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true},
  {id:'discount-3000',name:'3,000원 할인',points:20,enabled:true},
]

type KioskStep='phone'|'consent'|'source'|'action'|'rewards'|'redeem-pin'|'done'
type CompletedAction='earn'|'redeem'|null

function errorMessage(code:string){
  if(code==='INVALID_PIN') return '비밀번호가 올바르지 않습니다.'
  if(code==='INSUFFICIENT_POINTS') return '보유 포인트가 부족합니다.'
  if(code==='CONSENT_REQUIRED') return '개인정보 수집·이용 동의가 필요합니다.'
  if(code==='GOOGLE_SHEETS_NOT_CONFIGURED') return '데이터 저장소 연결을 확인해주세요.'
  if(code==='CUSTOMER_NOT_FOUND') return '고객 정보를 찾을 수 없습니다. 처음부터 다시 시도해주세요.'
  return '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
}

async function parseResponse(response:Response){
  const data=await response.json().catch(()=>({})) as Record<string,unknown>
  if(!response.ok) throw new Error(String(data.error??'REQUEST_FAILED'))
  return data
}

function Kiosk({rewards}:{rewards:Reward[]}){
  const [step,setStep]=useState<KioskStep>('phone')
  const [phone,setPhone]=useState('')
  const [customer,setCustomer]=useState<Customer|null>(null)
  const [isNew,setIsNew]=useState(false)
  const [consent,setConsent]=useState(false)
  const [selectedReward,setSelectedReward]=useState<Reward|null>(null)
  const [pin,setPin]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [completedAction,setCompletedAction]=useState<CompletedAction>(null)
  const lockRef=useRef(false)

  const reset=()=>{
    setStep('phone');setPhone('');setCustomer(null);setIsNew(false);setConsent(false)
    setSelectedReward(null);setPin('');setBusy(false);setError('');setCompletedAction(null);lockRef.current=false
  }

  useEffect(()=>{
    if(step!=='done') return
    const timer=window.setTimeout(reset,12000)
    return()=>window.clearTimeout(timer)
  },[step])

  const memberRequest=async(payload:Record<string,unknown>)=>{
    const response=await fetch('/api/members',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
    })
    return parseResponse(response)
  }

  const begin=async()=>{
    if(lockRef.current) return
    const normalized=normalizePhone(phone)
    if(normalized.length<10){setError('휴대전화번호를 정확히 입력해주세요.');return}
    lockRef.current=true;setBusy(true);setError('')
    try{
      const data=await memberRequest({action:'lookup',phone:normalized})
      const found=(data.customer??null) as Customer|null
      setPhone(normalized);setCustomer(found);setIsNew(!found);setConsent(false)
      setStep(found&&hasCurrentPrivacyConsent(found)?'action':'consent')
    }catch(error){setError(errorMessage(error instanceof Error?error.message:'REQUEST_FAILED'))}
    finally{setBusy(false);lockRef.current=false}
  }

  const continueConsent=async()=>{
    if(!consent){setError('필수 동의 항목을 확인해주세요.');return}
    setError('')
    if(isNew){setStep('source');return}
    if(lockRef.current)return
    lockRef.current=true;setBusy(true)
    try{
      const data=await memberRequest({action:'consent',phone,consent:true})
      setCustomer(data.customer as Customer);setStep('action')
    }catch(error){setError(errorMessage(error instanceof Error?error.message:'REQUEST_FAILED'))}
    finally{setBusy(false);lockRef.current=false}
  }

  const earn=async(source?:Source)=>{
    if(lockRef.current)return
    lockRef.current=true;setBusy(true);setError('')
    try{
      const data=await memberRequest({action:'earn',phone,source,consent:isNew&&consent})
      setCustomer(data.customer as Customer);setCompletedAction('earn');setStep('done')
    }catch(error){setError(errorMessage(error instanceof Error?error.message:'REQUEST_FAILED'))}
    finally{setBusy(false);lockRef.current=false}
  }

  const chooseReward=(reward:Reward)=>{
    if(!customer||customer.points<reward.points||!reward.enabled)return
    setSelectedReward(reward);setPin('');setError('');setStep('redeem-pin')
  }

  const redeem=async()=>{
    if(!selectedReward||lockRef.current)return
    if(pin.length!==4){setError('직원 비밀번호 4자리를 입력해주세요.');return}
    lockRef.current=true;setBusy(true);setError('')
    try{
      const data=await memberRequest({action:'redeem',phone,rewardId:selectedReward.id,pin})
      setCustomer(data.customer as Customer);setCompletedAction('redeem');setStep('done')
    }catch(error){setError(errorMessage(error instanceof Error?error.message:'REQUEST_FAILED'));setPin('')}
    finally{setBusy(false);lockRef.current=false}
  }

  const visits=customer?.visits??0
  const tier=visits>=10?'vip':visits>=5?'regular':visits>=2?'returning':'first'
  const thanks=tier==='vip'?'오늘도 반가운 단골 고객님!':tier==='regular'?'꾸준히 찾아주셔서 정말 고마워요.':tier==='returning'?'다시 만나서 반가워요!':'첫 방문을 환영해요!'
  const TierIcon=tier==='vip'?Crown:tier==='regular'?Sparkles:Heart
  const activeRewards=rewards.filter(reward=>reward.enabled)

  return <div className="kiosk" onClick={step==='done'?reset:undefined}>
    <div className={'kiosk-card '+(step==='done'?'celebrate '+tier:'')}>
      {step==='phone'&&<>
        <span className="step">LOOP 멤버십</span>
        <h1>전화번호를 입력하고<br/>포인트를 확인하세요</h1>
        <p>기존 고객은 포인트를 적립하거나 사용할 수 있어요.<br/>처음 방문하셨다면 간단한 가입 절차가 이어집니다.</p>
        <input autoFocus autoComplete="off" className="phone-input" value={phone} onChange={event=>setPhone(event.target.value)} onKeyDown={event=>event.key==='Enter'&&begin()} placeholder="010 0000 0000" inputMode="numeric" aria-label="휴대전화번호"/>
        <div className="privacy-inline"><ShieldCheck size={14}/><span>입력한 번호는 멤버십 가입 여부 확인에만 사용되며, 미가입 번호는 동의 전 저장하지 않습니다.</span></div>
        <button className="primary" disabled={busy} onClick={begin}>{busy?'확인 중...':'계속하기'} {!busy&&<ArrowRight size={17}/>}</button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='consent'&&<>
        <button className="ghost back" disabled={busy} onClick={reset}><ChevronLeft size={15}/> 번호 다시 입력</button>
        <span className="step">개인정보 확인</span>
        <h1>포인트 이용을 위해<br/>한 번만 확인해주세요</h1>
        <p>현재 동의 문안에 동의한 기록이 없는 고객에게만 표시됩니다.</p>
        <label className={'consent-box '+(consent?'checked':'')}>
          <input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/>
          <span className="fake-check">{consent&&<Check size={15}/>}</span>
          <span><strong>[필수] 개인정보 수집·이용에 동의합니다.</strong><small>휴대전화번호를 멤버십 식별 및 포인트 관리에 이용합니다.</small></span>
        </label>
        <details className="privacy-details">
          <summary>개인정보 수집·이용 안내 자세히 보기</summary>
          <dl>
            <div><dt>수집·이용 목적</dt><dd>멤버십 고객 식별, 방문 및 포인트 적립·사용 관리</dd></div>
            <div><dt>수집 항목</dt><dd>휴대전화번호</dd></div>
            <div><dt>보유·이용 기간</dt><dd>회원 탈퇴 또는 동의 철회 시까지. 관계 법령상 보존 의무가 있는 경우 해당 기간 동안 분리 보관합니다.</dd></div>
            <div><dt>동의 거부 권리</dt><dd>동의를 거부할 수 있으나 멤버십 포인트 서비스 이용이 제한될 수 있습니다.</dd></div>
          </dl>
          <p className="privacy-help">개인정보 삭제·동의 철회는 매장 관리자에게 요청할 수 있습니다. 만 14세 미만 고객은 법정대리인 동의가 필요합니다.</p>
        </details>
        <button className="primary" disabled={!consent||busy} onClick={continueConsent}>{busy?'저장 중...':'동의하고 계속하기'} <ArrowRight size={17}/></button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='source'&&<>
        <button className="ghost back" disabled={busy} onClick={()=>{setStep('consent');setError('')}}><ChevronLeft size={15}/> 이전</button>
        <span className="step">처음 오셨군요 · 마지막 단계</span>
        <h1>어디에서<br/>알고 오셨어요?</h1>
        <p>유입경로는 매장 마케팅 개선을 위한 통계로 활용돼요.</p>
        <div className="choices">{SOURCES.map(source=><button className="choice" disabled={busy} key={source} onClick={()=>earn(source)}>{busy?'적립 중...':source}</button>)}</div>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='action'&&customer&&<>
        <button className="ghost back" onClick={reset}><ChevronLeft size={15}/> 다른 번호 입력</button>
        <span className="step">반가워요, 기존 고객님</span>
        <h1>현재 <em>{customer.points}P</em>가<br/>쌓여 있어요</h1>
        <p>{customer.visits}번 방문해주셨어요. 오늘은 무엇을 도와드릴까요?</p>
        <div className="action-grid">
          <button className="action-card earn" disabled={busy} onClick={()=>earn()}><Sparkles size={25}/><strong>포인트 적립</strong><span>방문 포인트 +1P</span></button>
          <button className="action-card redeem" disabled={busy||activeRewards.length===0} onClick={()=>{setError('');setStep('rewards')}}><Gift size={25}/><strong>포인트 사용</strong><span>혜택으로 교환하기</span></button>
        </div>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='rewards'&&customer&&<>
        <button className="ghost back" onClick={()=>setStep('action')}><ChevronLeft size={15}/> 이전</button>
        <span className="step">보유 포인트 {customer.points}P</span>
        <h1>사용할 혜택을<br/>선택해주세요</h1>
        <p>포인트가 부족한 혜택은 자동으로 비활성화됩니다.</p>
        <div className="reward-list">{activeRewards.length?activeRewards.map(reward=>{
          const available=customer.points>=reward.points
          return <button key={reward.id} className="reward-choice" disabled={!available} onClick={()=>chooseReward(reward)}><span><strong>{reward.name}</strong><small>{available?'지금 사용할 수 있어요':`${reward.points-customer.points}P 더 필요해요`}</small></span><b>{reward.points}P</b></button>
        }):<div className="empty-state">현재 사용할 수 있는 혜택이 없습니다.</div>}</div>
      </>}

      {step==='redeem-pin'&&selectedReward&&<>
        <button className="ghost back" disabled={busy} onClick={()=>{setStep('rewards');setPin('');setError('')}}><ChevronLeft size={15}/> 혜택 다시 선택</button>
        <div className="success-icon secure"><LockKeyhole size={31}/></div>
        <h1>직원 확인이<br/>필요해요</h1>
        <p><strong>{selectedReward.name}</strong> · {selectedReward.points}P 사용<br/>직원이 관리자 비밀번호를 입력하면 사용이 완료됩니다.</p>
        <input autoFocus className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={event=>event.key==='Enter'&&redeem()} placeholder="••••" aria-label="직원 비밀번호"/>
        <button className="primary" disabled={busy||pin.length!==4} onClick={redeem}>{busy?'확인 중...':'포인트 사용 확정'} <Check size={17}/></button>
        {error&&<div className="form-error">{error}</div>}
      </>}

      {step==='done'&&customer&&<>
        <div className="success-icon">{completedAction==='redeem'?<Gift size={34}/>:<TierIcon size={36}/>}</div>
        <h1>{completedAction==='redeem'?'혜택 사용이 완료됐어요!':thanks}</h1>
        <p>{completedAction==='redeem'?<>{selectedReward?.name} 혜택을 적용했어요.<br/>직원에게 완료 화면을 보여주세요.</>:<>{customer.visits}번째 방문을 기록했어요.<br/>오늘도 소중한 시간을 내주셔서 감사합니다.</>}</p>
        <div className="reward"><span>{completedAction==='redeem'?'사용 후 포인트':'현재 포인트'}</span><strong>{customer.points} P</strong></div>
        <div className="auto-reset">잠시 후 다음 고객 화면으로 돌아갑니다<br/><span>화면을 누르면 바로 시작할 수 있어요</span></div>
      </>}
      <div className="demo-note">LOOP 멤버십 · 개인정보는 포인트 서비스 운영 목적으로만 처리합니다.</div>
    </div>
  </div>
}

function Dashboard({customers,rewards,pin,onRewardsSaved}:{customers:Customer[];rewards:Reward[];pin:string;onRewardsSaved:(rewards:Reward[])=>void}){
  const [draft,setDraft]=useState<Reward[]>(rewards)
  const [saving,setSaving]=useState(false)
  const [status,setStatus]=useState('')
  useEffect(()=>setDraft(rewards),[rewards])

  const total=customers.length
  const visits=customers.reduce((sum,customer)=>sum+customer.visits,0)
  const repeat=customers.filter(customer=>customer.visits>1).length
  const counts=SOURCES.map(source=>({source,count:customers.filter(customer=>customer.source===source).length}))
  const max=Math.max(...counts.map(item=>item.count),1)

  const updateReward=(id:string,patch:Partial<Reward>)=>setDraft(current=>current.map(reward=>reward.id===id?{...reward,...patch}:reward))
  const addReward=()=>setDraft(current=>[...current,{id:crypto.randomUUID(),name:'새 혜택',points:10,enabled:true}])
  const removeReward=(id:string)=>setDraft(current=>current.length>1?current.filter(reward=>reward.id!==id):current)

  const save=async()=>{
    const invalid=draft.some(reward=>!reward.name.trim()||!Number.isInteger(Number(reward.points))||Number(reward.points)<1)
    if(invalid){setStatus('혜택명과 1P 이상의 정수 포인트를 확인해주세요.');return}
    setSaving(true);setStatus('')
    try{
      const response=await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin,rewards:draft})})
      const data=await parseResponse(response)
      onRewardsSaved(data.rewards as Reward[]);setStatus('포인트 혜택 설정을 저장했습니다.')
    }catch(error){setStatus(errorMessage(error instanceof Error?error.message:'REQUEST_FAILED'))}
    finally{setSaving(false)}
  }

  return <main className="main">
    <div className="hero"><div><div className="eyebrow">Member intelligence</div><h1 className="title">고객이 다시 오는 이유를<br/>매일 확인하세요.</h1><div className="sub">멤버십 현황, 유입경로, 포인트 혜택을 한곳에서 관리합니다.</div></div><div className="admin-badge"><LockKeyhole size={14}/> 관리자 인증됨</div></div>
    <div className="grid"><div className="stat"><div className="stat-label">전체 고객</div><div className="stat-value">{total}</div><div className="stat-note">멤버십 등록 고객</div></div><div className="stat"><div className="stat-label">누적 방문</div><div className="stat-value">{visits}</div><div className="stat-note">전체 방문 기록</div></div><div className="stat"><div className="stat-label">재방문 고객</div><div className="stat-value">{repeat}</div><div className="stat-note">전체의 {total?Math.round(repeat/total*100):0}%</div></div><div className="stat"><div className="stat-label">보유 포인트 합계</div><div className="stat-value">{customers.reduce((sum,customer)=>sum+customer.points,0)} P</div><div className="stat-note">현재 고객 잔액 합계</div></div></div>
    <div className="dash-grid"><section className="panel"><div className="panel-title">고객 유입경로 <span className="pill">전체</span></div>{counts.map(item=><div className="source-row" key={item.source}><div className="source-name">{item.source}</div><div className="track"><div className="fill" style={{width:(item.count/max*100)+'%'}}/></div><div className="source-pct">{item.count}명</div></div>)}</section>
    <section className="panel privacy-panel"><div className="panel-title">개인정보 운영 기준 <span className="pill"><ShieldCheck size={13}/> 보호</span></div><ul><li>고객 전화번호는 관리자 화면에서 마스킹 표시</li><li>미가입 번호는 동의 전 저장하지 않음</li><li>현재 동의 버전과 동의 일시 기록</li><li>삭제·동의 철회 요청 시 Customers 데이터에서 처리</li></ul><div className="privacy-version">동의 문안 버전 · 2026-09-01-v1</div></section></div>

    <section className="panel reward-admin"><div className="panel-title"><span>포인트 혜택 설정</span><button className="mini-button" onClick={addReward}><Plus size={14}/> 혜택 추가</button></div><div className="reward-admin-list">{draft.map(reward=><div className="reward-admin-row" key={reward.id}><label className="reward-enabled"><input type="checkbox" checked={reward.enabled} onChange={event=>updateReward(reward.id,{enabled:event.target.checked})}/><span>{reward.enabled?'사용':'중지'}</span></label><input className="reward-name-input" value={reward.name} onChange={event=>updateReward(reward.id,{name:event.target.value})} aria-label="혜택명"/><div className="points-input-wrap"><input type="number" min={1} step={1} value={reward.points} onChange={event=>updateReward(reward.id,{points:Number(event.target.value)})} aria-label="필요 포인트"/><span>P</span></div><button className="icon-button danger" aria-label="혜택 삭제" disabled={draft.length===1} onClick={()=>removeReward(reward.id)}><Trash2 size={16}/></button></div>)}</div><div className="reward-admin-footer"><span className={status.includes('저장했습니다')?'save-status success':'save-status'}>{status}</span><button className="save-button" disabled={saving} onClick={save}><Save size={16}/>{saving?'저장 중...':'설정 저장'}</button></div></section>

    <section className="panel customer-panel"><div className="panel-title">최근 고객 <span className="pill"><Users size={13}/> {total}명</span></div>{customers.length?customers.slice().reverse().map(customer=><div className="customer-row" key={customer.id}><div className="customer-main"><div className="avatar">{customer.phone.slice(-2)}</div><div><div className="customer-name">{maskPhone(customer.phone)}</div><div className="customer-meta">{customer.source??'기존 고객'} · {customer.visits}회 방문 · 최근 {customer.lastVisit}</div></div></div><div className="customer-points">{customer.points} P</div></div>):<div className="empty-state">등록된 고객이 없습니다.</div>}</section>
  </main>
}

function AdminLogin({open,onClose,onSuccess}:{open:boolean;onClose:()=>void;onSuccess:(pin:string,customers:Customer[])=>void}){
  const [pin,setPin]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{if(open){setPin('');setError('')}},[open])
  if(!open)return null
  const submit=async()=>{
    if(pin.length!==4){setError('관리자 비밀번호 4자리를 입력해주세요.');return}
    setBusy(true);setError('')
    try{
      const response=await fetch('/api/members',{headers:{'x-admin-pin':pin},cache:'no-store'})
      const data=await parseResponse(response)
      onSuccess(pin,data.customers as Customer[])
    }catch(error){setError(errorMessage(error instanceof Error?error.message:'REQUEST_FAILED'));setPin('')}
    finally{setBusy(false)}
  }
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><div className="admin-login"><div className="success-icon secure"><LockKeyhole size={30}/></div><h2>관리자 확인</h2><p>고객 정보와 포인트 설정을 보호하기 위해<br/>관리자 비밀번호가 필요합니다.</p><input autoFocus className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={event=>event.key==='Enter'&&submit()} placeholder="••••"/><button className="primary" disabled={busy||pin.length!==4} onClick={submit}>{busy?'확인 중...':'관리자 모드 열기'}</button>{error&&<div className="form-error">{error}</div>}<button className="ghost" onClick={onClose}>취소</button></div></div>
}

export default function Home(){
  const [mode,setMode]=useState<'kiosk'|'dashboard'>('kiosk')
  const [customers,setCustomers]=useState<Customer[]>([])
  const [rewards,setRewards]=useState<Reward[]>(FALLBACK_REWARDS)
  const [adminPin,setAdminPin]=useState('')
  const [adminLogin,setAdminLogin]=useState(false)

  useEffect(()=>{
    fetch('/api/settings',{cache:'no-store'}).then(parseResponse).then(data=>{
      const loaded=data.rewards as Reward[]|undefined
      if(loaded?.length)setRewards(loaded)
    }).catch(()=>{})
  },[])

  const enterAdmin=(pin:string,loadedCustomers:Customer[])=>{setAdminPin(pin);setCustomers(loadedCustomers);setMode('dashboard');setAdminLogin(false)}
  const backToKiosk=()=>{setMode('kiosk');setAdminPin('');setCustomers([])}

  return <div className="shell">
    <header className="topbar"><div className="brand"><div className="mark">L</div> LOOP</div><div className="switcher"><button className={mode==='kiosk'?'active':''} onClick={backToKiosk}>고객 화면</button><button className={mode==='dashboard'?'active':''} onClick={()=>setAdminLogin(true)}><LockKeyhole size={13}/> 관리자 보기</button></div></header>
    {mode==='kiosk'?<Kiosk rewards={rewards}/>:<Dashboard customers={customers} rewards={rewards} pin={adminPin} onRewardsSaved={setRewards}/>} 
    <AdminLogin open={adminLogin} onClose={()=>setAdminLogin(false)} onSuccess={enterAdmin}/>
  </div>
}
