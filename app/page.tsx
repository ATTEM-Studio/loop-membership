'use client'

import {useEffect,useRef,useState} from 'react'
import {ArrowRight,Check,ChevronLeft,Crown,Gift,Heart,History,LockKeyhole,Plus,Save,ShieldCheck,Sparkles,Trash2,Users,X} from 'lucide-react'
import {SOURCES,normalizePhone,type Reward,type Source} from '../lib/domain'

const FALLBACK_REWARDS:Reward[]=[
 {id:'coffee',name:'아메리카노 1잔',points:10,enabled:true},
 {id:'discount-3000',name:'3,000원 할인',points:20,enabled:true},
]

type KioskCustomer={phone:string;visits:number;points:number;lastVisit:string;consentCurrent:boolean}
type AdminCustomer={id:string;phoneMasked:string;source?:Source;visits:number;points:number;lastVisit:string}
type AdminTransaction={date:string;type:'EARN'|'REDEEM'|'ADJUST';delta:number;balanceBefore:number;balanceAfter:number;description:string}
type AdminCustomerDetail={customer:AdminCustomer;transactions:AdminTransaction[]}
type KioskStep='phone'|'consent'|'source'|'action'|'rewards'|'redeem-pin'|'done'
type CompletedAction='earn'|'redeem'|null

function errorMessage(code:string){
 if(code==='INVALID_PIN')return '비밀번호가 올바르지 않습니다.'
 if(code==='INSUFFICIENT_POINTS')return '보유 포인트가 부족합니다.'
 if(code==='CONSENT_REQUIRED')return '개인정보 수집·이용 동의가 필요합니다.'
 if(code==='GOOGLE_SHEETS_NOT_CONFIGURED')return '데이터 저장소 연결을 확인해주세요.'
 if(code==='CUSTOMER_NOT_FOUND')return '고객 정보를 찾을 수 없습니다. 처음부터 다시 시도해주세요.'
 if(code==='POINTS_UNCHANGED')return '현재 포인트와 동일합니다.'
 if(code==='INVALID_POINTS')return '포인트는 0 이상의 정수로 입력해주세요.'
 return '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
}
async function parseResponse(response:Response){const data=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new Error(String(data.error??'REQUEST_FAILED'));return data}
function formatTransactionDate(value:string){const date=new Date(value);return Number.isNaN(date.getTime())?value:date.toLocaleString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}
function transactionLabel(type:AdminTransaction['type']){return type==='EARN'?'적립':type==='REDEEM'?'사용':'관리자 조정'}

function Kiosk({rewards}:{rewards:Reward[]}){
 const [step,setStep]=useState<KioskStep>('phone'),[phone,setPhone]=useState(''),[customer,setCustomer]=useState<KioskCustomer|null>(null)
 const [isNew,setIsNew]=useState(false),[consent,setConsent]=useState(false),[selectedReward,setSelectedReward]=useState<Reward|null>(null)
 const [pin,setPin]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[completed,setCompleted]=useState<CompletedAction>(null)
 const lock=useRef(false)
 const reset=()=>{setStep('phone');setPhone('');setCustomer(null);setIsNew(false);setConsent(false);setSelectedReward(null);setPin('');setBusy(false);setError('');setCompleted(null);lock.current=false}
 useEffect(()=>{if(step!=='done')return;const timer=window.setTimeout(reset,12000);return()=>window.clearTimeout(timer)},[step])
 const request=async(payload:Record<string,unknown>)=>parseResponse(await fetch('/api/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}))
 const run=async(task:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await task()}catch(e){setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'))}finally{setBusy(false);lock.current=false}}

 const begin=()=>run(async()=>{const normalized=normalizePhone(phone);if(normalized.length<10)throw new Error('INVALID_PHONE');const data=await request({action:'lookup',phone:normalized});const found=(data.customer??null) as KioskCustomer|null;setPhone(normalized);setCustomer(found);setIsNew(!found);setConsent(false);setStep(found?.consentCurrent?'action':'consent')})
 const continueConsent=()=>{if(!consent){setError('필수 동의 항목을 확인해주세요.');return}if(isNew){setError('');setStep('source');return}run(async()=>{const data=await request({action:'consent',phone,consent:true});setCustomer(data.customer as KioskCustomer);setStep('action')})}
 const earn=(source?:Source)=>run(async()=>{const data=await request({action:'earn',phone,source,consent:isNew&&consent});setCustomer(data.customer as KioskCustomer);setCompleted('earn');setStep('done')})
 const chooseReward=(reward:Reward)=>{if(customer&&customer.points>=reward.points&&reward.enabled){setSelectedReward(reward);setPin('');setError('');setStep('redeem-pin')}}
 const redeem=()=>{if(!selectedReward)return;if(pin.length!==4){setError('직원 비밀번호 4자리를 입력해주세요.');return}run(async()=>{const data=await request({action:'redeem',phone,rewardId:selectedReward.id,pin});setCustomer(data.customer as KioskCustomer);setCompleted('redeem');setStep('done')})}

 const visits=customer?.visits??0,tier=visits>=10?'vip':visits>=5?'regular':visits>=2?'returning':'first'
 const thanks=tier==='vip'?'오늘도 반가운 단골 고객님!':tier==='regular'?'꾸준히 찾아주셔서 정말 고마워요.':tier==='returning'?'다시 만나서 반가워요!':'첫 방문을 환영해요!'
 const TierIcon=tier==='vip'?Crown:tier==='regular'?Sparkles:Heart,activeRewards=rewards.filter(r=>r.enabled)
 return <div className="kiosk" onClick={step==='done'?reset:undefined}><div className={'kiosk-card '+(step==='done'?'celebrate '+tier:'')}>
  {step==='phone'&&<><span className="step">LOOP 멤버십</span><h1>전화번호를 입력하고 포인트를 확인하세요</h1><p>기존 고객은 포인트를 적립하거나 사용할 수 있어요. 처음 방문하셨다면 간단한 가입 절차가 이어집니다.</p><input autoFocus autoComplete="off" className="phone-input" value={phone} onChange={e=>setPhone(e.target.value)} onKeyDown={e=>e.key==='Enter'&&begin()} placeholder="010 0000 0000" inputMode="numeric" aria-label="휴대전화번호"/><div className="privacy-inline"><ShieldCheck size={14}/><span>입력한 번호는 가입 여부 확인에만 사용되며, 미가입 번호는 동의 전 저장하지 않습니다.</span></div><button className="primary" disabled={busy} onClick={begin}>{busy?'확인 중...':'계속하기'} {!busy&&<ArrowRight size={17}/>}</button>{error&&<div className="form-error">{error}</div>}</>}
  {step==='consent'&&<><button className="ghost back" disabled={busy} onClick={reset}><ChevronLeft size={15}/> 번호 다시 입력</button><span className="step">개인정보 확인</span><h1>포인트 이용을 위해 한 번만 확인해주세요</h1><p>현재 동의 문안에 동의한 기록이 없는 고객에게만 표시됩니다.</p><label className={'consent-box '+(consent?'checked':'')}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span className="fake-check">{consent&&<Check size={15}/>}</span><span><strong>[필수] 개인정보 수집·이용에 동의합니다.</strong><small>휴대전화번호를 멤버십 식별 및 포인트 관리에 이용합니다.</small></span></label><details className="privacy-details"><summary>개인정보 수집·이용 안내 자세히 보기</summary><dl><div><dt>수집·이용 목적</dt><dd>멤버십 고객 식별, 방문 및 포인트 적립·사용 관리</dd></div><div><dt>수집 항목</dt><dd>휴대전화번호</dd></div><div><dt>보유·이용 기간</dt><dd>회원 탈퇴 또는 동의 철회 시까지. 관계 법령상 보존 의무가 있는 경우 해당 기간 동안 분리 보관합니다.</dd></div><div><dt>동의 거부 권리</dt><dd>동의를 거부할 수 있으나 멤버십 포인트 서비스 이용이 제한될 수 있습니다.</dd></div></dl><p className="privacy-help">개인정보 삭제·동의 철회는 매장 관리자에게 요청할 수 있습니다. 만 14세 미만 고객은 법정대리인 동의가 필요합니다.</p></details><button className="primary" disabled={!consent||busy} onClick={continueConsent}>{busy?'저장 중...':'동의하고 계속하기'} <ArrowRight size={17}/></button>{error&&<div className="form-error">{error}</div>}</>}
  {step==='source'&&<><button className="ghost back" disabled={busy} onClick={()=>setStep('consent')}><ChevronLeft size={15}/> 이전</button><span className="step">처음 오셨군요 · 마지막 단계</span><h1>어디에서 알고 오셨어요?</h1><p>유입경로는 매장 마케팅 개선을 위한 통계로 활용돼요.</p><div className="choices">{SOURCES.map(s=><button className="choice" disabled={busy} key={s} onClick={()=>earn(s)}>{busy?'적립 중...':s}</button>)}</div>{error&&<div className="form-error">{error}</div>}</>}
  {step==='action'&&customer&&<><button className="ghost back" onClick={reset}><ChevronLeft size={15}/> 다른 번호 입력</button><span className="step">반가워요, 기존 고객님</span><h1>현재 <em>{customer.points}P</em>가 쌓여 있어요</h1><p>{customer.visits}번 방문해주셨어요. 오늘은 무엇을 도와드릴까요?</p><div className="action-grid"><button className="action-card earn" disabled={busy} onClick={()=>earn()}><Sparkles size={25}/><strong>포인트 적립</strong><span>방문 포인트 +1P</span></button><button className="action-card redeem" disabled={busy||!activeRewards.length} onClick={()=>setStep('rewards')}><Gift size={25}/><strong>포인트 사용</strong><span>혜택으로 교환하기</span></button></div>{error&&<div className="form-error">{error}</div>}</>}
  {step==='rewards'&&customer&&<><button className="ghost back" onClick={()=>setStep('action')}><ChevronLeft size={15}/> 이전</button><span className="step">보유 포인트 {customer.points}P</span><h1>사용할 혜택을 선택해주세요</h1><p>포인트가 부족한 혜택은 자동으로 비활성화됩니다.</p><div className="reward-list">{activeRewards.length?activeRewards.map(r=>{const available=customer.points>=r.points;return <button key={r.id} className="reward-choice" disabled={!available} onClick={()=>chooseReward(r)}><span><strong>{r.name}</strong><small>{available?'지금 사용할 수 있어요':`${r.points-customer.points}P 더 필요해요`}</small></span><b>{r.points}P</b></button>}):<div className="empty-state">현재 사용할 수 있는 혜택이 없습니다.</div>}</div></>}
  {step==='redeem-pin'&&selectedReward&&<><button className="ghost back" disabled={busy} onClick={()=>{setStep('rewards');setPin('');setError('')}}><ChevronLeft size={15}/> 혜택 다시 선택</button><div className="success-icon secure"><LockKeyhole size={31}/></div><h1>직원 확인이 필요해요</h1><p><strong>{selectedReward.name}</strong> · {selectedReward.points}P 사용. 직원이 관리자 비밀번호를 입력하면 완료됩니다.</p><input autoFocus className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e=>e.key==='Enter'&&redeem()} placeholder="••••" aria-label="직원 비밀번호"/><button className="primary" disabled={busy||pin.length!==4} onClick={redeem}>{busy?'확인 중...':'포인트 사용 확정'} <Check size={17}/></button>{error&&<div className="form-error">{error}</div>}</>}
  {step==='done'&&customer&&<><div className="success-icon">{completed==='redeem'?<Gift size={34}/>:<TierIcon size={36}/>}</div><h1>{completed==='redeem'?'혜택 사용이 완료됐어요!':thanks}</h1><p>{completed==='redeem'?`${selectedReward?.name??''} 혜택을 적용했어요. 직원에게 완료 화면을 보여주세요.`:`${customer.visits}번째 방문을 기록했어요. 오늘도 소중한 시간을 내주셔서 감사합니다.`}</p><div className="reward"><span>{completed==='redeem'?'사용 후 포인트':'현재 포인트'}</span><strong>{customer.points} P</strong></div><div className="auto-reset">잠시 후 다음 고객 화면으로 돌아갑니다<span>화면을 누르면 바로 시작할 수 있어요</span></div></>}
  <div className="demo-note">LOOP 멤버십 · 개인정보는 포인트 서비스 운영 목적으로만 처리합니다.</div>
 </div></div>
}

function CustomerDetailModal({customer,pin,onClose,onCustomerChange}:{customer:AdminCustomer;pin:string;onClose:()=>void;onCustomerChange:(customer:AdminCustomer)=>void}){
 const [detail,setDetail]=useState<AdminCustomerDetail|null>(null),[targetPoints,setTargetPoints]=useState(String(customer.points))
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('')
 useEffect(()=>{
  let active=true
  setLoading(true);setError('');setDetail(null);setTargetPoints(String(customer.points))
  parseResponse(fetch('/api/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'detail',customerId:customer.id,pin})}))
   .then(data=>{if(!active)return;const next={customer:data.customer as AdminCustomer,transactions:(data.transactions??[]) as AdminTransaction[]};setDetail(next);setTargetPoints(String(next.customer.points))})
   .catch(e=>active&&setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED')))
   .finally(()=>active&&setLoading(false))
  return()=>{active=false}
 },[customer.id,customer.points,pin])
 const target=targetPoints.trim()===''?NaN:Number(targetPoints),valid=Number.isInteger(target)&&target>=0,delta=detail&&valid?target-detail.customer.points:0
 const adjust=async()=>{
  if(!detail||!valid){setError('포인트는 0 이상의 정수로 입력해주세요.');return}
  if(delta===0){setError('현재 포인트와 동일합니다.');return}
  setSaving(true);setError('')
  try{
   const data=await parseResponse(await fetch('/api/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adjust',customerId:detail.customer.id,targetPoints:target,pin})}))
   const next={customer:data.customer as AdminCustomer,transactions:(data.transactions??[]) as AdminTransaction[]}
   setDetail(next);setTargetPoints(String(next.customer.points));onCustomerChange(next.customer)
  }catch(e){setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'))}finally{setSaving(false)}
 }
 return <div className="modal-backdrop customer-detail-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="customer-detail-modal" role="dialog" aria-modal="true" aria-labelledby="customer-detail-title">
  <div className="detail-modal-header"><div><div className="eyebrow">Customer detail</div><h2 id="customer-detail-title">{customer.phoneMasked}</h2><p>고객의 포인트 잔액과 전체 변경 내역을 확인하고 수정할 수 있습니다.</p></div><button className="modal-close" onClick={onClose} aria-label="고객 상세 닫기"><X size={19}/></button></div>
  {loading?<div className="detail-loading">포인트 내역을 불러오고 있습니다.</div>:error&&!detail?<div className="form-error detail-error">{error}</div>:detail&&<>
   <div className="detail-summary"><div className="detail-summary-main"><span>현재 포인트</span><strong>{detail.customer.points} P</strong></div><div><span>방문</span><strong>{detail.customer.visits}회</strong></div><div><span>최근 방문</span><strong>{detail.customer.lastVisit||'-'}</strong></div><div><span>유입경로</span><strong>{detail.customer.source??'기존 고객'}</strong></div></div>
   <div className="point-adjust-card"><div className="point-adjust-copy"><strong>포인트 수정</strong><span>최종 잔액을 입력하면 차액만 관리자 조정 내역으로 기록됩니다.</span></div><div className="point-adjust-controls"><label className="admin-points-input"><input type="number" min={0} step={1} value={targetPoints} onChange={e=>{setTargetPoints(e.target.value);setError('')}} aria-label="수정할 최종 포인트"/><span>P</span></label><button className="save-button point-adjust-button" disabled={saving||!valid||delta===0} onClick={adjust}><Save size={15}/>{saving?'수정 중...':'포인트 수정'}</button></div><div className={'adjust-preview '+(delta>0?'positive':delta<0?'negative':'')}>{valid?(delta===0?'변경 없음':`현재보다 ${delta>0?'+':''}${delta}P`):'0 이상의 정수를 입력해주세요.'}</div>{error&&<div className="form-error">{error}</div>}</div>
   <div className="history-section"><div className="history-title"><span><History size={17}/> 포인트 전체 내역</span><span className="pill">{detail.transactions.length}건</span></div>{detail.transactions.length?<div className="transaction-list">{detail.transactions.map((transaction,index)=><div className="transaction-row" key={`${transaction.date}-${transaction.type}-${index}`}><div className={'transaction-type '+transaction.type.toLowerCase()}>{transactionLabel(transaction.type)}</div><div className="transaction-copy"><strong>{transaction.description}</strong><span>{formatTransactionDate(transaction.date)} · 변경 전 {transaction.balanceBefore}P → 변경 후 {transaction.balanceAfter}P</span></div><div className="transaction-amount"><strong className={transaction.delta>=0?'positive':'negative'}>{transaction.delta>0?'+':''}{transaction.delta}P</strong><span>잔액 {transaction.balanceAfter}P</span></div></div>)}</div>:<div className="empty-state">기록된 포인트 내역이 없습니다.</div>}</div>
  </>}
 </section></div>
}

function Dashboard({customers,rewards,pin,onRewardsSaved,onCustomersChange}:{customers:AdminCustomer[];rewards:Reward[];pin:string;onRewardsSaved:(r:Reward[])=>void;onCustomersChange:(c:AdminCustomer[])=>void}){
 const [draft,setDraft]=useState<Reward[]>(rewards),[saving,setSaving]=useState(false),[status,setStatus]=useState(''),[selectedCustomer,setSelectedCustomer]=useState<AdminCustomer|null>(null)
 useEffect(()=>setDraft(rewards),[rewards])
 const total=customers.length,visits=customers.reduce((a,c)=>a+c.visits,0),repeat=customers.filter(c=>c.visits>1).length
 const counts=SOURCES.map(s=>({s,n:customers.filter(c=>c.source===s).length})),max=Math.max(...counts.map(x=>x.n),1)
 const update=(id:string,patch:Partial<Reward>)=>setDraft(v=>v.map(r=>r.id===id?{...r,...patch}:r))
 const save=async()=>{if(draft.some(r=>!r.name.trim()||!Number.isInteger(Number(r.points))||Number(r.points)<1)){setStatus('혜택명과 1P 이상의 정수 포인트를 확인해주세요.');return}setSaving(true);setStatus('');try{const data=await parseResponse(await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin,rewards:draft})}));onRewardsSaved(data.rewards as Reward[]);setStatus('포인트 혜택 설정을 저장했습니다.')}catch(e){setStatus(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'))}finally{setSaving(false)}}
 const removeCustomer=async(customer:AdminCustomer)=>{if(!window.confirm(`${customer.phoneMasked} 고객의 멤버십 정보와 포인트·방문 기록을 삭제할까요?\n삭제 후 복구할 수 없습니다.`))return;setStatus('');try{await parseResponse(await fetch('/api/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'delete',customerId:customer.id,pin})}));onCustomersChange(customers.filter(c=>c.id!==customer.id));if(selectedCustomer?.id===customer.id)setSelectedCustomer(null);setStatus('고객 개인정보와 관련 기록을 삭제했습니다.')}catch(e){setStatus(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'))}}
 const openCustomer=(customer:AdminCustomer)=>setSelectedCustomer(customer)
 const updateCustomer=(customer:AdminCustomer)=>{onCustomersChange(customers.map(item=>item.id===customer.id?customer:item));setSelectedCustomer(customer)}
 return <><main className="main"><div className="hero"><div><div className="eyebrow">Member intelligence</div><h1 className="title">고객이 다시 오는 이유를 매일 확인하세요.</h1><div className="sub">멤버십 현황, 유입경로, 포인트 혜택을 한곳에서 관리합니다.</div></div><div className="admin-badge"><LockKeyhole size={14}/> 관리자 인증됨</div></div>
  <div className="grid"><div className="stat"><div className="stat-label">전체 고객</div><div className="stat-value">{total}</div><div className="stat-note">멤버십 등록 고객</div></div><div className="stat"><div className="stat-label">누적 방문</div><div className="stat-value">{visits}</div><div className="stat-note">전체 방문 기록</div></div><div className="stat"><div className="stat-label">재방문 고객</div><div className="stat-value">{repeat}</div><div className="stat-note">전체의 {total?Math.round(repeat/total*100):0}%</div></div><div className="stat"><div className="stat-label">보유 포인트 합계</div><div className="stat-value">{customers.reduce((a,c)=>a+c.points,0)} P</div><div className="stat-note">현재 고객 잔액 합계</div></div></div>
  <div className="dash-grid"><section className="panel"><div className="panel-title">고객 유입경로 <span className="pill">전체</span></div>{counts.map(x=><div className="source-row" key={x.s}><div className="source-name">{x.s}</div><div className="track"><div className="fill" style={{width:(x.n/max*100)+'%'}}/></div><div className="source-pct">{x.n}명</div></div>)}</section><section className="panel privacy-panel"><div className="panel-title">개인정보 운영 기준 <span className="pill"><ShieldCheck size={13}/> 보호</span></div><ul><li>관리자 화면에도 전체 전화번호를 전송하지 않고 마스킹</li><li>미가입 번호는 동의 전 저장하지 않음</li><li>동의 문안 버전과 동의 일시를 서버에 기록</li><li>삭제 요청 시 Customers·Visits·Transactions 관련 기록 함께 삭제</li></ul><div className="privacy-version">동의 문안 버전 · 2026-09-01-v1</div></section></div>
  <section className="panel reward-admin"><div className="panel-title"><span>포인트 혜택 설정</span><button className="mini-button" onClick={()=>setDraft(v=>[...v,{id:crypto.randomUUID(),name:'새 혜택',points:10,enabled:true}])}><Plus size={14}/> 혜택 추가</button></div><div className="reward-admin-list">{draft.map(r=><div className="reward-admin-row" key={r.id}><label className="reward-enabled"><input type="checkbox" checked={r.enabled} onChange={e=>update(r.id,{enabled:e.target.checked})}/><span>{r.enabled?'사용':'중지'}</span></label><input className="reward-name-input" value={r.name} onChange={e=>update(r.id,{name:e.target.value})} aria-label="혜택명"/><div className="points-input-wrap"><input type="number" min={1} step={1} value={r.points} onChange={e=>update(r.id,{points:Number(e.target.value)})} aria-label="필요 포인트"/><span>P</span></div><button className="icon-button danger" disabled={draft.length===1} onClick={()=>setDraft(v=>v.length>1?v.filter(x=>x.id!==r.id):v)} aria-label="혜택 삭제"><Trash2 size={16}/></button></div>)}</div><div className="reward-admin-footer"><span className={status.includes('했습니다')?'save-status success':'save-status'}>{status}</span><button className="save-button" disabled={saving} onClick={save}><Save size={16}/>{saving?'저장 중...':'설정 저장'}</button></div></section>
  <section className="panel customer-panel"><div className="panel-title">최근 고객 <span className="pill"><Users size={13}/> {total}명</span></div>{customers.length?customers.slice().reverse().map(c=><div className="customer-row interactive" key={c.id} role="button" tabIndex={0} onClick={()=>openCustomer(c)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCustomer(c)}}}><div className="customer-main"><div className="avatar">••</div><div><div className="customer-name">{c.phoneMasked}</div><div className="customer-meta">{c.source??'기존 고객'} · {c.visits}회 방문 · 최근 {c.lastVisit}</div></div></div><div className="customer-actions"><div className="customer-points">{c.points} P</div><button className="icon-button danger" onClick={e=>{e.stopPropagation();void removeCustomer(c)}} aria-label="고객 개인정보 삭제"><Trash2 size={15}/></button></div></div>):<div className="empty-state">등록된 고객이 없습니다.</div>}</section>
 </main>{selectedCustomer&&<CustomerDetailModal customer={selectedCustomer} pin={pin} onClose={()=>setSelectedCustomer(null)} onCustomerChange={updateCustomer}/>}</>
}

function AdminLogin({open,onClose,onSuccess}:{open:boolean;onClose:()=>void;onSuccess:(pin:string,customers:AdminCustomer[])=>void}){
 const [pin,setPin]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');useEffect(()=>{if(open){setPin('');setError('')}},[open]);if(!open)return null
 const submit=async()=>{if(pin.length!==4){setError('관리자 비밀번호 4자리를 입력해주세요.');return}setBusy(true);setError('');try{const data=await parseResponse(await fetch('/api/members',{headers:{'x-admin-pin':pin},cache:'no-store'}));onSuccess(pin,data.customers as AdminCustomer[])}catch(e){setError(errorMessage(e instanceof Error?e.message:'REQUEST_FAILED'));setPin('')}finally{setBusy(false)}}
 return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="admin-login"><div className="success-icon secure"><LockKeyhole size={30}/></div><h2>관리자 확인</h2><p>고객 정보와 포인트 설정을 보호하기 위해 관리자 비밀번호가 필요합니다.</p><input autoFocus className="pin-input" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,4))} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="••••"/><button className="primary" disabled={busy||pin.length!==4} onClick={submit}>{busy?'확인 중...':'관리자 모드 열기'}</button>{error&&<div className="form-error">{error}</div>}<button className="ghost" onClick={onClose}>취소</button></div></div>
}

export default function Home(){
 const [mode,setMode]=useState<'kiosk'|'dashboard'>('kiosk'),[customers,setCustomers]=useState<AdminCustomer[]>([]),[rewards,setRewards]=useState<Reward[]>(FALLBACK_REWARDS),[adminPin,setAdminPin]=useState(''),[adminLogin,setAdminLogin]=useState(false)
 useEffect(()=>{fetch('/api/settings',{cache:'no-store'}).then(parseResponse).then(data=>{const loaded=data.rewards as Reward[]|undefined;if(loaded?.length)setRewards(loaded)}).catch(()=>{})},[])
 const backToKiosk=()=>{setMode('kiosk');setAdminPin('');setCustomers([])}
 return <div className="shell"><header className="topbar"><div className="brand"><div className="mark">L</div> LOOP</div><div className="switcher"><button className={mode==='kiosk'?'active':''} onClick={backToKiosk}>고객 화면</button><button className={mode==='dashboard'?'active':''} onClick={()=>setAdminLogin(true)}><LockKeyhole size={13}/> 관리자 보기</button></div></header>{mode==='kiosk'?<Kiosk rewards={rewards}/>:<Dashboard customers={customers} rewards={rewards} pin={adminPin} onRewardsSaved={setRewards} onCustomersChange={setCustomers}/>}<AdminLogin open={adminLogin} onClose={()=>setAdminLogin(false)} onSuccess={(pin,list)=>{setAdminPin(pin);setCustomers(list);setMode('dashboard');setAdminLogin(false)}}/></div>
}
