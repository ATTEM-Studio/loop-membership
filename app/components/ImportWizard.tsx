'use client'

import {useEffect,useMemo,useState} from 'react'
import {AlertTriangle,ArrowLeft,ArrowRight,Check,FileSpreadsheet,RefreshCw,ShieldCheck,Upload,X} from 'lucide-react'
import type {EarningMode,Source} from '../../lib/domain'
import {buildNormalizedImportPayload,createInitialSheetConfigs,duplicateDecisionsComplete,setSourceColumnMapping} from '../../lib/import-wizard-model'
import {parseWorkbookBytes,type ParsedWorkbook} from '../../lib/import-workbook'
import type {DuplicateField,DuplicateFieldChoice,DuplicateResolution,ImportBalanceTarget,ImportField,ImportSheetMapping,ImportSheetRole,ImportValidationIssue,NormalizedImportPayload} from '../../lib/import-types'
import {MAX_IMPORT_FILE_BYTES,MAX_IMPORT_SOURCE_ROWS} from '../../lib/import-types'

type BalanceView={visits?:number;visitPoints?:number;stamps?:number;paymentPoints?:number;lastVisit?:string;source?:Source}
type PreviewDuplicate={phone:string;phoneMasked:string;current:BalanceView;imported:BalanceView}
type Preview={
  newCustomers:number
  duplicateCustomers:number
  duplicates:PreviewDuplicate[]
  issues:ImportValidationIssue[]
  unsupportedColumns:{sheetName:string;columns:string[]}[]
  totals:{customers:number;visits:number;pointHistory:number;visitPoints:number;stamps:number;paymentPoints:number}
}
type CommitSummary={analyzedRows:number;newCustomers:number;duplicateCustomers:number;excludedRows:number;errorRows:number;visits:number;visitPoints:number;stamps:number;paymentPoints:number}

type Props={open:boolean;onClose:()=>void;onImported:()=>void}

type Step='file'|'sheets'|'mapping'|'preview'|'confirm'|'success'

const ROLE_LABELS:Record<ImportSheetRole,string>={customers:'고객정보',visits:'방문이력',points:'포인트이력',ignore:'제외'}
const MODE_LABELS:Record<EarningMode,string>={visit:'방문포인트',stamp:'도장',payment:'결제포인트'}
const BALANCE_LABELS:Record<ImportBalanceTarget,string>={visitPoints:'방문포인트',stamps:'도장',paymentPoints:'결제포인트',ignore:'가져오지 않음'}
const FIELD_LABELS:Record<ImportField,string>={
  phone:'전화번호',externalId:'외부 회원ID',visits:'방문횟수',balance:'포인트/잔액',visitPoints:'방문포인트',stamps:'도장',paymentPoints:'결제포인트',lastVisit:'최근방문일',source:'유입경로',
  date:'날짜',paymentAmount:'결제금액',delta:'적립·차감량',transactionType:'거래유형',remainingBalance:'거래 후 잔액',description:'내용',
}
const FIELD_OPTIONS:Record<Exclude<ImportSheetRole,'ignore'>,ImportField[]>={
  customers:['phone','externalId','visits','balance','visitPoints','stamps','paymentPoints','lastVisit','source'],
  visits:['phone','externalId','date','paymentAmount','source'],
  points:['phone','externalId','date','delta','remainingBalance','description','balance'],
}
const MANUAL_FIELDS:DuplicateField[]=['visits','visitPoints','stamps','paymentPoints','lastVisit','source']
const MANUAL_LABELS:Record<DuplicateField,string>={visits:'방문횟수',visitPoints:'방문포인트',stamps:'도장',paymentPoints:'결제포인트',lastVisit:'최근방문일',source:'유입경로'}

function formatBytes(bytes:number){if(bytes<1024)return `${bytes}B`;if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)}KB`;return `${(bytes/1024/1024).toFixed(1)}MB`}
function formatNumber(value:number|undefined){return new Intl.NumberFormat('ko-KR').format(value??0)}
function mappedField(config:ImportSheetMapping,header:string){return (Object.entries(config.mappings).find(([,mapped])=>mapped===header)?.[0]??'ignore') as ImportField|'ignore'}
function needsBalanceTarget(field:ImportField|'ignore'){return field==='balance'||field==='delta'||field==='remainingBalance'}
function importError(code:string){
  if(code==='INVALID_PIN')return '관리자 비밀번호가 올바르지 않습니다.'
  if(code==='IMPORT_ALREADY_APPLIED')return '이미 반영한 동일 데이터입니다. 중복 가져오기를 막았습니다.'
  if(code==='DUPLICATE_RESOLUTION_REQUIRED')return '중복 고객 처리 방법을 모두 선택해주세요.'
  if(code==='IMPORT_CONFIRM_REQUIRED')return '최종 확인 항목을 체크해주세요.'
  if(code==='IMPORT_HAS_BLOCKING_ISSUES')return '오류 행을 확인하고 제외 여부를 선택해주세요.'
  if(code==='GOOGLE_SHEETS_NOT_CONFIGURED')return 'Google Sheets 연결 설정을 확인해주세요.'
  return '가져오기 처리 중 오류가 발생했습니다. 입력값을 다시 확인해주세요.'
}
async function responseJson(response:Response){const data=await response.json().catch(()=>({})) as Record<string,unknown>;if(!response.ok)throw new Error(String(data.error??'REQUEST_FAILED'));return data}
async function sha256(buffer:ArrayBuffer){const digest=await crypto.subtle.digest('SHA-256',buffer);return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('')}

function StepBar({step}:{step:Step}){
  const labels=[['file','파일'],['sheets','시트'],['mapping','매핑'],['preview','검토'],['confirm','확정']] as const
  const current=Math.max(0,labels.findIndex(([key])=>key===step))
  return <div className="import-stepbar">{labels.map(([key,label],index)=><div key={key} className={'import-step '+(index<=current?'active':'')}><span>{index<current?<Check size={12}/>:index+1}</span><b>{label}</b></div>)}</div>
}

function SummaryCards({preview}:{preview:Preview}){
  const cards=[
    ['가져올 고객',preview.totals.customers,'명'],['신규 고객',preview.newCustomers,'명'],['중복 확인',preview.duplicateCustomers,'명'],['방문 이력',preview.totals.visits,'건'],
    ['방문포인트',preview.totals.visitPoints,'P'],['도장',preview.totals.stamps,'개'],['결제포인트',preview.totals.paymentPoints,'P'],['오류',preview.issues.length,'건'],
  ] as const
  return <div className="import-summary-grid">{cards.map(([label,value,unit])=><div key={label}><span>{label}</span><strong>{formatNumber(value)}<small>{unit}</small></strong></div>)}</div>
}

function ManualField({field,duplicate,resolution,onChange}:{field:DuplicateField;duplicate:PreviewDuplicate;resolution:DuplicateResolution;onChange:(choice:DuplicateFieldChoice)=>void}){
  const imported=duplicate.imported[field]
  if(imported===undefined)return null
  const existing=duplicate.current[field]
  return <div className="duplicate-manual-row"><span>{MANUAL_LABELS[field]}</span><select value={resolution.fields?.[field]??''} onChange={event=>onChange(event.target.value as DuplicateFieldChoice)}><option value="">선택</option><option value="existing">기존 LOOP · {String(existing??'-')}</option><option value="imported">가져온 DB · {String(imported??'-')}</option></select></div>
}

export default function ImportWizard({open,onClose,onImported}:Props){
  const [step,setStep]=useState<Step>('file')
  const [workbook,setWorkbook]=useState<ParsedWorkbook|null>(null)
  const [fileInfo,setFileInfo]=useState<{name:string;size:number;hash:string}|null>(null)
  const [configs,setConfigs]=useState<ImportSheetMapping[]>([])
  const [payload,setPayload]=useState<NormalizedImportPayload|null>(null)
  const [preview,setPreview]=useState<Preview|null>(null)
  const [resolutions,setResolutions]=useState<DuplicateResolution[]>([])
  const [pin,setPin]=useState('')
  const [currentMode,setCurrentMode]=useState<EarningMode>('visit')
  const [excludeErrors,setExcludeErrors]=useState(false)
  const [acknowledged,setAcknowledged]=useState(false)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [success,setSuccess]=useState<{importId:string;summary:CommitSummary}|null>(null)

  useEffect(()=>{if(!open)return;fetch('/api/settings',{cache:'no-store'}).then(response=>response.json()).then(data=>setCurrentMode((data?.earningSettings?.mode??'visit') as EarningMode)).catch(()=>{})},[open])
  useEffect(()=>{if(open)return;setStep('file');setWorkbook(null);setFileInfo(null);setConfigs([]);setPayload(null);setPreview(null);setResolutions([]);setPin('');setExcludeErrors(false);setAcknowledged(false);setError('');setSuccess(null)},[open])
  const usedConfigs=configs.filter(config=>config.role!=='ignore')
  const hasBalanceModeMismatch=useMemo(()=>configs.some(config=>Object.values(config.balanceTargets).some(target=>target!=='ignore'&&target!==(currentMode==='visit'?'visitPoints':currentMode==='stamp'?'stamps':'paymentPoints'))),[configs,currentMode])
  const decisionsReady=preview?duplicateDecisionsComplete(preview.duplicates,resolutions):false

  if(!open)return null

  const chooseFile=async(file:File|undefined)=>{
    if(!file)return
    setError('');setBusy(true)
    try{
      if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw new Error('지원 형식은 .xlsx, .xls, .csv 입니다.')
      if(file.size>MAX_IMPORT_FILE_BYTES)throw new Error(`파일은 최대 ${formatBytes(MAX_IMPORT_FILE_BYTES)}까지 가져올 수 있습니다.`)
      const buffer=await file.arrayBuffer()
      const parsed=parseWorkbookBytes(buffer,file.name)
      if(parsed.totalRows>MAX_IMPORT_SOURCE_ROWS)throw new Error(`한 번에 최대 ${formatNumber(MAX_IMPORT_SOURCE_ROWS)}개 데이터 행까지 가져올 수 있습니다.`)
      const hash=await sha256(buffer)
      setWorkbook(parsed);setFileInfo({name:file.name,size:file.size,hash});setConfigs(createInitialSheetConfigs(parsed));setStep('sheets')
    }catch(e){setError(e instanceof Error?e.message:'파일을 읽지 못했습니다.')}finally{setBusy(false)}
  }

  const changeRole=(sheetName:string,role:ImportSheetRole)=>{
    if(!workbook)return
    const sheet=workbook.sheets.find(item=>item.name===sheetName);if(!sheet)return
    const rebuilt=createInitialSheetConfigs({...workbook,sheets:[{...sheet,inferredRole:role}],totalRows:sheet.rowCount})[0]
    setConfigs(current=>current.map(config=>config.sheetName===sheetName?rebuilt:config))
  }

  const changeMapping=(sheetName:string,header:string,target:ImportField|'ignore')=>{
    setConfigs(current=>current.map(config=>config.sheetName===sheetName?setSourceColumnMapping(config,header,target):config))
  }
  const changeBalanceTarget=(sheetName:string,header:string,target:ImportBalanceTarget)=>setConfigs(current=>current.map(config=>config.sheetName===sheetName?{...config,balanceTargets:{...config.balanceTargets,[header]:target}}:config))

  const createPayload=()=>{
    if(!workbook||!fileInfo)return null
    const normalized=buildNormalizedImportPayload(workbook,configs,fileInfo.hash)
    setPayload(normalized)
    return normalized
  }

  const requestPreview=async()=>{
    const normalized=createPayload();if(!normalized)return
    if(pin.length!==4){setError('관리자 비밀번호 4자리를 입력해주세요.');return}
    setBusy(true);setError('')
    try{
      const data=await responseJson(await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'preview',pin,payload:normalized})}))
      const next=data.preview as Preview
      setPreview(next);setResolutions([]);setExcludeErrors(next.issues.length===0);setStep('preview')
    }catch(e){setError(importError(e instanceof Error?e.message:'REQUEST_FAILED'))}finally{setBusy(false)}
  }

  const setResolution=(phone:string,strategy:DuplicateResolution['strategy'])=>setResolutions(current=>{
    const next:DuplicateResolution={phone,strategy,fields:strategy==='manual'?{}:undefined}
    return [...current.filter(item=>item.phone!==phone),next]
  })
  const setManualField=(phone:string,field:DuplicateField,choice:DuplicateFieldChoice)=>setResolutions(current=>current.map(item=>item.phone===phone?{...item,fields:{...item.fields,[field]:choice}}:item))
  const applyAll=(strategy:'keep-existing'|'use-imported')=>{if(preview)setResolutions(preview.duplicates.map(duplicate=>({phone:duplicate.phone,strategy})))}

  const cleanedPayload=()=>payload?{...payload,issues:excludeErrors?payload.issues.map(issue=>({...issue,blocking:false})):payload.issues}:null
  const goConfirm=()=>{
    if(!preview||!payload)return
    if(preview.issues.length&&!excludeErrors){setError('오류 행을 제외하고 진행할지 확인해주세요.');return}
    if(!decisionsReady){setError('중복 고객의 처리 방법을 모두 선택해주세요.');return}
    setError('');setStep('confirm')
  }
  const commit=async()=>{
    const finalPayload=cleanedPayload();if(!finalPayload||!preview)return
    if(!acknowledged){setError('최종 확인 항목을 체크해주세요.');return}
    setBusy(true);setError('')
    try{
      const data=await responseJson(await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'commit',pin,payload:finalPayload,resolutions,acknowledged:true,importId:`imp-${Date.now().toString(36)}`})}))
      setSuccess({importId:String(data.importId),summary:data.summary as CommitSummary});setStep('success')
    }catch(e){setError(importError(e instanceof Error?e.message:'REQUEST_FAILED'))}finally{setBusy(false)}
  }

  const closeOrReload=()=>{if(success){onImported();return}onClose()}

  return <div className="import-backdrop" onMouseDown={event=>event.target===event.currentTarget&&closeOrReload()}>
    <section className="import-modal" role="dialog" aria-modal="true" aria-label="기존 고객 DB 가져오기">
      <header className="import-header"><div><span className="import-kicker"><FileSpreadsheet size={15}/> DB Migration</span><h2>기존 고객 DB 가져오기</h2><p>다른 포인트 시스템의 Excel·CSV를 LOOP 구조로 안전하게 변환합니다.</p></div><button className="import-close" onClick={closeOrReload}><X size={20}/></button></header>
      {step!=='success'&&<StepBar step={step}/>} 
      <div className="import-body">
        {step==='file'&&<div className="import-file-step">
          <label className={'import-dropzone '+(busy?'busy':'')}><input type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={event=>void chooseFile(event.target.files?.[0])}/><Upload size={30}/><strong>{busy?'파일을 분석하고 있습니다':'Excel 또는 CSV 파일 선택'}</strong><span>.xlsx · .xls · .csv / 최대 {formatBytes(MAX_IMPORT_FILE_BYTES)}</span><small>원본 파일은 브라우저에서만 읽고 서버에 저장하지 않습니다.</small></label>
          <div className="import-safety"><ShieldCheck size={18}/><div><strong>현재 Google Sheet 구조는 그대로 유지됩니다.</strong><span>새 Import 탭을 만들지 않고 승인한 데이터만 기존 고객·포인트 시트에 반영합니다.</span></div></div>
        </div>}

        {step==='sheets'&&workbook&&fileInfo&&<>
          <div className="import-section-head"><div><h3>파일 안의 모든 시트를 확인했어요</h3><p>LOOP가 용도를 먼저 추정했습니다. 다르면 역할만 바꿔주세요.</p></div><div className="file-chip"><FileSpreadsheet size={16}/><span>{fileInfo.name}</span><b>{formatBytes(fileInfo.size)}</b></div></div>
          <div className="sheet-role-list">{workbook.sheets.map(sheet=>{const config=configs.find(item=>item.sheetName===sheet.name)!;return <div className="sheet-role-card" key={sheet.name}><div className="sheet-role-main"><strong>{sheet.name}</strong><span>{sheet.rowCount.toLocaleString()}행 · 헤더 {sheet.headerRowNumber}행</span><small>{sheet.headers.filter(Boolean).slice(0,5).join(' · ')||'헤더 없음'}</small></div><select value={config.role} onChange={event=>changeRole(sheet.name,event.target.value as ImportSheetRole)}>{Object.entries(ROLE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>})}</div>
          <div className="import-actions"><button className="import-secondary" onClick={()=>setStep('file')}><ArrowLeft size={16}/> 다시 선택</button><button className="import-primary" disabled={!usedConfigs.length} onClick={()=>setStep('mapping')}>컬럼 매핑하기 <ArrowRight size={16}/></button></div>
        </>}

        {step==='mapping'&&workbook&&<>
          <div className="import-section-head"><div><h3>LOOP에 저장할 위치를 확인해주세요</h3><p>특히 ‘포인트·잔액’ 컬럼은 방문포인트/도장/결제포인트 중 어디에 넣을지 확인해야 합니다.</p></div></div>
          {hasBalanceModeMismatch&&<div className="import-warning"><AlertTriangle size={18}/><span>현재 매장은 <strong>{MODE_LABELS[currentMode]}</strong> 방식입니다. 다른 종류로 가져오는 잔액도 삭제되거나 합쳐지지 않고 별도로 보존됩니다.</span></div>}
          <div className="mapping-sheet-list">{usedConfigs.map(config=>{const sheet=workbook.sheets.find(item=>item.name===config.sheetName)!;return <section className="mapping-sheet" key={config.sheetName}><div className="mapping-sheet-title"><div><strong>{config.sheetName}</strong><span>{ROLE_LABELS[config.role]}</span></div><small>원본 컬럼 → LOOP 필드</small></div><div className="mapping-rows">{sheet.headers.filter(Boolean).map(header=>{const field=mappedField(config,header);return <div className="mapping-row" key={header}><div className="source-column"><span>원본</span><strong>{header}</strong></div><ArrowRight size={15}/><label><span>LOOP 저장 위치</span><select value={field} onChange={event=>changeMapping(config.sheetName,header,event.target.value as ImportField|'ignore')}><option value="ignore">가져오지 않음</option>{config.role!=='ignore'&&FIELD_OPTIONS[config.role].map(option=><option value={option} key={option}>{FIELD_LABELS[option]}</option>)}</select></label>{needsBalanceTarget(field)&&<label className="balance-target"><span>잔액 종류</span><select value={config.balanceTargets[header]??'visitPoints'} onChange={event=>changeBalanceTarget(config.sheetName,header,event.target.value as ImportBalanceTarget)}>{Object.entries(BALANCE_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}</div>})}</div></section>})}</div>
          <div className="pin-preview-box"><label><span>관리자 비밀번호</span><input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,'').slice(0,4))} placeholder="4자리"/></label><span>서버가 현재 LOOP 고객과 비교하기 위해 관리자 인증을 한 번 더 확인합니다.</span></div>
          <div className="import-actions"><button className="import-secondary" onClick={()=>setStep('sheets')}><ArrowLeft size={16}/> 이전</button><button className="import-primary" disabled={busy||pin.length!==4} onClick={()=>void requestPreview()}>{busy?<><RefreshCw className="spin" size={16}/> 비교 중</>:<>가져오기 결과 미리보기 <ArrowRight size={16}/></>}</button></div>
        </>}

        {step==='preview'&&preview&&<>
          <div className="import-section-head"><div><h3>실제 반영 전에 한 번 더 확인해주세요</h3><p>아직 Google Sheet에는 아무 데이터도 쓰지 않았습니다.</p></div></div>
          <SummaryCards preview={preview}/>
          {preview.issues.length>0&&<section className="import-review-section error-section"><div className="review-title"><strong>오류 데이터 {preview.issues.length}건</strong><span>문제가 있는 행은 이미 가져오기 대상에서 빠져 있습니다.</span></div><div className="issue-list">{preview.issues.slice(0,20).map((issue,index)=><div key={`${issue.sheetName}-${issue.rowNumber}-${index}`}><b>{issue.sheetName} · {issue.rowNumber}행</b><span>{issue.message}</span></div>)}{preview.issues.length>20&&<small>외 {preview.issues.length-20}건</small>}</div><label className="import-check"><input type="checkbox" checked={excludeErrors} onChange={event=>setExcludeErrors(event.target.checked)}/><span>오류 행은 제외하고 정상 데이터만 가져옵니다.</span></label></section>}
          {preview.unsupportedColumns.length>0&&<section className="import-review-section"><div className="review-title"><strong>LOOP에서 사용하지 않는 정보</strong><span>아래 컬럼은 저장 위치가 없어 가져오지 않습니다.</span></div><div className="unsupported-list">{preview.unsupportedColumns.map(item=><div key={item.sheetName}><b>{item.sheetName}</b><span>{item.columns.join(' · ')}</span></div>)}</div></section>}
          {preview.duplicates.length>0&&<section className="import-review-section duplicate-section"><div className="review-title with-actions"><div><strong>중복 고객 {preview.duplicates.length}명</strong><span>자동 합산하지 않습니다. 처리 방법을 선택해주세요.</span></div><div><button onClick={()=>applyAll('keep-existing')}>모두 기존 유지</button><button onClick={()=>applyAll('use-imported')}>모두 가져온 값</button></div></div><div className="duplicate-list">{preview.duplicates.map(duplicate=>{const resolution=resolutions.find(item=>item.phone===duplicate.phone);return <div className="duplicate-card" key={duplicate.phone}><div className="duplicate-phone"><strong>{duplicate.phoneMasked}</strong><span>현재 LOOP와 업로드 파일에 모두 존재</span></div><div className="duplicate-compare"><div><span>현재 LOOP</span><b>방문 {duplicate.current.visits??0}회 · P {duplicate.current.visitPoints??0} · 도장 {duplicate.current.stamps??0} · 결제P {duplicate.current.paymentPoints??0}</b></div><div><span>가져올 DB</span><b>방문 {duplicate.imported.visits??'-'}회 · P {duplicate.imported.visitPoints??'-'} · 도장 {duplicate.imported.stamps??'-'} · 결제P {duplicate.imported.paymentPoints??'-'}</b></div></div><div className="duplicate-strategy"><label><input type="radio" name={`dup-${duplicate.phone}`} checked={resolution?.strategy==='keep-existing'} onChange={()=>setResolution(duplicate.phone,'keep-existing')}/><span>기존 LOOP 유지</span></label><label><input type="radio" name={`dup-${duplicate.phone}`} checked={resolution?.strategy==='use-imported'} onChange={()=>setResolution(duplicate.phone,'use-imported')}/><span>가져온 DB 값으로 갱신</span></label><label><input type="radio" name={`dup-${duplicate.phone}`} checked={resolution?.strategy==='manual'} onChange={()=>setResolution(duplicate.phone,'manual')}/><span>항목별 직접 선택</span></label></div>{resolution?.strategy==='manual'&&<div className="duplicate-manual">{MANUAL_FIELDS.map(field=><ManualField key={field} field={field} duplicate={duplicate} resolution={resolution} onChange={choice=>setManualField(duplicate.phone,field,choice)}/>)}</div>}</div>})}</div></section>}
          <div className="import-actions"><button className="import-secondary" onClick={()=>setStep('mapping')}><ArrowLeft size={16}/> 매핑 수정</button><button className="import-primary" disabled={(preview.issues.length>0&&!excludeErrors)||!decisionsReady} onClick={goConfirm}>최종 확인 <ArrowRight size={16}/></button></div>
        </>}

        {step==='confirm'&&preview&&<>
          <div className="final-confirm"><div className="final-icon"><ShieldCheck size={28}/></div><h3>이 내용으로 LOOP에 반영할까요?</h3><p>기존 Google Sheet 구조는 바뀌지 않습니다. 없는 과거 날짜는 만들지 않고, 중복 고객은 방금 선택한 정책만 적용합니다.</p><SummaryCards preview={preview}/><div className="final-rules"><div><Check size={15}/> 기존 포인트와 가져온 포인트를 자동 합산하지 않음</div><div><Check size={15}/> 방문포인트·도장·결제포인트를 별도 잔액으로 보존</div><div><Check size={15}/> 가져온 고객은 다음 실제 방문에서 LOOP 개인정보 동의를 다시 받음</div><div><Check size={15}/> 동일 데이터 재실행 시 중복 반영 차단</div></div><label className="import-check final-check"><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/><span>위 이전 내용을 확인했으며 고객 DB에 반영합니다.</span></label></div>
          <div className="import-actions"><button className="import-secondary" disabled={busy} onClick={()=>setStep('preview')}><ArrowLeft size={16}/> 이전</button><button className="import-primary danger-primary" disabled={busy||!acknowledged} onClick={()=>void commit()}>{busy?<><RefreshCw className="spin" size={16}/> 반영 중</>:<>DB 가져오기 실행 <Upload size={16}/></>}</button></div>
        </>}

        {step==='success'&&success&&<div className="import-success"><div className="success-check"><Check size={32}/></div><span>DB 이전 완료</span><h3>{formatNumber(success.summary.newCustomers)}명의 신규 고객을 포함해 데이터를 반영했어요.</h3><p>Import ID · {success.importId}</p><div className="import-summary-grid success-summary"><div><span>신규 고객</span><strong>{formatNumber(success.summary.newCustomers)}<small>명</small></strong></div><div><span>중복 고객</span><strong>{formatNumber(success.summary.duplicateCustomers)}<small>명</small></strong></div><div><span>방문 이력</span><strong>{formatNumber(success.summary.visits)}<small>건</small></strong></div><div><span>방문포인트</span><strong>{formatNumber(success.summary.visitPoints)}<small>P</small></strong></div></div><div className="import-safety success-note"><ShieldCheck size={18}/><div><strong>같은 데이터는 다시 실행해도 중복 반영되지 않습니다.</strong><span>완료를 누르면 관리자 대시보드를 새 데이터 기준으로 새로고침합니다.</span></div></div><button className="import-primary finish-button" onClick={closeOrReload}>완료하고 새로고침</button></div>}
        {error&&<div className="import-error"><AlertTriangle size={17}/><span>{error}</span></div>}
      </div>
    </section>
  </div>
}
