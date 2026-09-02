import {SOURCES,type Source} from './domain'
import type {
  ImportBalanceTarget,
  ImportField,
  ImportSheetRole,
  ImportValidationIssue,
  NormalizedImportCustomer,
  NormalizedImportPointEntry,
  NormalizedImportVisit,
} from './import-types'

const HEADER_ALIASES:Record<ImportField,string[]>={
  phone:['전화번호','휴대폰','휴대폰번호','핸드폰','핸드폰번호','휴대전화','휴대전화번호','전화','mobile','phone','tel','cellphone'],
  externalId:['회원번호','회원id','고객번호','고객id','멤버id','memberid','customerid','userid','userno','memberno'],
  visits:['방문수','방문횟수','총방문수','총방문횟수','누적방문','누적방문수','visits','visitcount'],
  balance:['포인트','잔여포인트','보유포인트','잔액','적립금','마일리지','point','points','balance'],
  visitPoints:['방문포인트','방문p','visitpoints'],
  stamps:['도장','스탬프','stamp','stamps'],
  paymentPoints:['결제포인트','결제p','적립포인트','paymentpoints','paypoints'],
  lastVisit:['최근방문','최근방문일','마지막방문','마지막방문일','lastvisit','lastvisitdate'],
  source:['유입경로','방문경로','알게된경로','source','channel'],
  date:['날짜','일자','방문일','이용일','적립일','거래일','일시','date','datetime','visitdate','usedate'],
  paymentAmount:['결제금액','결제액','이용금액','구매금액','매출','amount','paymentamount','price'],
  delta:['적립','차감','변동포인트','변동량','적립포인트','사용포인트','delta','change','earned','used'],
  transactionType:['거래유형','구분','유형','적립차감구분','type','transactiontype'],
  remainingBalance:['잔여잔액','거래후잔액','변동후잔액','remainingbalance','afterbalance'],
  description:['내용','메모','비고','설명','description','memo','note'],
}

function normalizeHeader(value:unknown){
  return String(value??'').trim().toLowerCase().replace(/[\s_\-./()\[\]%]/g,'')
}

function aliases(field:ImportField){return new Set(HEADER_ALIASES[field].map(normalizeHeader))}

export function inferColumnTarget(header:string,role:ImportSheetRole):ImportField|undefined{
  const normalized=normalizeHeader(header)
  const allowed:ImportField[]=role==='customers'
    ?['phone','externalId','visits','visitPoints','stamps','paymentPoints','balance','lastVisit','source']
    :role==='visits'
      ?['phone','externalId','date','paymentAmount','source']
      :role==='points'
        ?['phone','externalId','date','delta','transactionType','remainingBalance','description','balance']
        :[]
  return allowed.find(field=>aliases(field).has(normalized))
}

export function inferSheetRole(name:string,headers:string[]):ImportSheetRole{
  const n=normalizeHeader(name)
  const headerTargets=headers.map(header=>({
    customer:inferColumnTarget(header,'customers'),
    visit:inferColumnTarget(header,'visits'),
    point:inferColumnTarget(header,'points'),
  }))
  let customerScore=0,visitScore=0,pointScore=0
  if(/회원|고객|멤버|customer|member/.test(n)) customerScore+=4
  if(/방문|이용|visit|usage/.test(n)) visitScore+=4
  if(/적립|포인트|거래|마일리지|point|transaction/.test(n)) pointScore+=4
  for(const target of headerTargets){
    if(target.customer) customerScore+=target.customer==='phone'||target.customer==='externalId'?2:1
    if(target.visit) visitScore+=target.visit==='date'?2:1
    if(target.point) pointScore+=target.point==='delta'||target.point==='remainingBalance'?2:1
  }
  if(Math.max(customerScore,visitScore,pointScore)<3)return 'ignore'
  if(customerScore>=visitScore&&customerScore>=pointScore)return 'customers'
  if(visitScore>=pointScore)return 'visits'
  return 'points'
}

export function normalizeLegacyPhone(value:unknown){
  let digits=String(value??'').replace(/\D/g,'')
  if(digits.startsWith('82')&&digits.length===12)digits='0'+digits.slice(2)
  return /^010\d{8}$/.test(digits)?digits:undefined
}

export function normalizeLegacyDate(value:unknown){
  if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10)
  if(typeof value==='number'&&Number.isFinite(value)){
    const millis=Date.UTC(1899,11,30)+Math.floor(value)*86400000
    const date=new Date(millis)
    return Number.isNaN(date.getTime())?undefined:date.toISOString().slice(0,10)
  }
  const text=String(value??'').trim()
  if(!text)return undefined
  const m=text.match(/^(\d{4})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})(?:일)?/)
  if(!m)return undefined
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3])
  const date=new Date(Date.UTC(year,month-1,day))
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return undefined
  return date.toISOString().slice(0,10)
}

function nonNegativeInteger(value:unknown){
  if(value===''||value===null||value===undefined)return undefined
  const number=Number(String(value).replace(/,/g,''))
  return Number.isInteger(number)&&number>=0?number:undefined
}

function numeric(value:unknown){
  if(value===''||value===null||value===undefined)return undefined
  const number=Number(String(value).replace(/,/g,''))
  return Number.isFinite(number)?number:undefined
}

function sourceValue(value:unknown):Source|undefined{
  const text=String(value??'').trim()
  return SOURCES.find(source=>source===text)
}

export function buildExternalIdPhoneMap(customers:Array<{externalId?:string;phone?:string}>){
  const map=new Map<string,string>()
  for(const customer of customers){
    const id=String(customer.externalId??'').trim()
    const phone=normalizeLegacyPhone(customer.phone)
    if(id&&phone&&!map.has(id))map.set(id,phone)
  }
  return map
}

type NormalizeRowsInput={
  sheetName:string
  role:ImportSheetRole
  headers:string[]
  rows:unknown[][]
  mappings:Partial<Record<ImportField,string>>
  externalIdToPhone:Map<string,string>
  balanceTargets:Record<string,ImportBalanceTarget>
}

type NormalizeRowsResult={
  customers:NormalizedImportCustomer[]
  visits:NormalizedImportVisit[]
  points:NormalizedImportPointEntry[]
  issues:ImportValidationIssue[]
  unsupportedColumns:string[]
}

export function normalizeRowsForRole(input:NormalizeRowsInput):NormalizeRowsResult{
  const usedHeaders=new Set(Object.values(input.mappings).filter(Boolean) as string[])
  const unsupportedColumns=input.headers.filter(header=>header&&!usedHeaders.has(header))
  const indexByHeader=new Map(input.headers.map((header,index)=>[header,index]))
  const get=(row:unknown[],field:ImportField)=>{
    const header=input.mappings[field]
    const index=header===undefined?undefined:indexByHeader.get(header)
    return index===undefined?undefined:row[index]
  }
  const result:NormalizeRowsResult={customers:[],visits:[],points:[],issues:[],unsupportedColumns}

  input.rows.forEach((row,rowIndex)=>{
    const rowNumber=rowIndex+2
    const directPhone=normalizeLegacyPhone(get(row,'phone'))
    const externalId=String(get(row,'externalId')??'').trim()||undefined
    const phone=directPhone||(externalId?input.externalIdToPhone.get(externalId):undefined)
    if(input.role!=='ignore'&&!phone){
      result.issues.push({sheetName:input.sheetName,rowNumber,code:'PHONE_UNRESOLVED',message:'전화번호를 확인할 수 없습니다.',field:'phone',blocking:true})
      return
    }

    if(input.role==='customers'&&phone){
      const customer:NormalizedImportCustomer={sheetName:input.sheetName,rowNumber,phone}
      if(externalId)customer.externalId=externalId
      const visits=get(row,'visits')
      if(visits!==undefined&&visits!==''){
        const parsed=nonNegativeInteger(visits)
        if(parsed===undefined)result.issues.push({sheetName:input.sheetName,rowNumber,code:'INVALID_VISITS',message:'방문횟수는 0 이상의 정수여야 합니다.',field:'visits',value:visits,blocking:true})
        else customer.visits=parsed
      }
      for(const [field,target] of [['visitPoints','visitPoints'],['stamps','stamps'],['paymentPoints','paymentPoints']] as const){
        const raw=get(row,field)
        if(raw!==undefined&&raw!==''){
          const parsed=nonNegativeInteger(raw)
          if(parsed===undefined)result.issues.push({sheetName:input.sheetName,rowNumber,code:'INVALID_BALANCE',message:'잔액은 0 이상의 정수여야 합니다.',field,value:raw,blocking:true})
          else customer[target]=parsed
        }
      }
      const genericHeader=input.mappings.balance
      const genericValue=get(row,'balance')
      if(genericHeader&&genericValue!==undefined&&genericValue!==''){
        const target=input.balanceTargets[genericHeader]
        if(target&&target!=='ignore'){
          const parsed=nonNegativeInteger(genericValue)
          if(parsed===undefined)result.issues.push({sheetName:input.sheetName,rowNumber,code:'INVALID_BALANCE',message:'잔액은 0 이상의 정수여야 합니다.',field:'balance',value:genericValue,blocking:true})
          else customer[target]=parsed
        }
      }
      const lastVisit=get(row,'lastVisit')
      if(lastVisit!==undefined&&lastVisit!==''){
        const parsed=normalizeLegacyDate(lastVisit)
        if(parsed)customer.lastVisit=parsed
        else result.issues.push({sheetName:input.sheetName,rowNumber,code:'INVALID_DATE',message:'최근 방문일을 날짜로 해석할 수 없습니다.',field:'lastVisit',value:lastVisit})
      }
      const source=sourceValue(get(row,'source'));if(source)customer.source=source
      result.customers.push(customer)
      return
    }

    if(input.role==='visits'&&phone){
      const rawDate=get(row,'date')
      const date=normalizeLegacyDate(rawDate)
      if(!date){result.issues.push({sheetName:input.sheetName,rowNumber,code:'INVALID_DATE',message:'방문일을 날짜로 해석할 수 없습니다.',field:'date',value:rawDate,blocking:true});return}
      const visit:NormalizedImportVisit={sheetName:input.sheetName,rowNumber,phone,date}
      const paymentAmount=numeric(get(row,'paymentAmount'));if(paymentAmount!==undefined&&paymentAmount>=0)visit.paymentAmount=paymentAmount
      const source=sourceValue(get(row,'source'));if(source)visit.source=source
      result.visits.push(visit)
      return
    }

    if(input.role==='points'&&phone){
      const rawDate=get(row,'date'),date=normalizeLegacyDate(rawDate)
      if(!date){result.issues.push({sheetName:input.sheetName,rowNumber,code:'INVALID_DATE',message:'포인트 거래일을 날짜로 해석할 수 없습니다.',field:'date',value:rawDate,blocking:true});return}
      const rawDelta=get(row,'delta'),delta=numeric(rawDelta)
      if(delta===undefined){result.issues.push({sheetName:input.sheetName,rowNumber,code:'INVALID_DELTA',message:'포인트 변동량을 숫자로 해석할 수 없습니다.',field:'delta',value:rawDelta,blocking:true});return}
      const deltaHeader=input.mappings.delta??''
      const balanceHeader=input.mappings.balance??''
      const target=(input.balanceTargets[deltaHeader]??input.balanceTargets[balanceHeader]) as ImportBalanceTarget|undefined
      if(!target||target==='ignore'){result.issues.push({sheetName:input.sheetName,rowNumber,code:'BALANCE_TARGET_REQUIRED',message:'포인트 종류를 선택해주세요.',field:'delta',blocking:true});return}
      const point:NormalizedImportPointEntry={sheetName:input.sheetName,rowNumber,phone,date,delta,target}
      const remaining=nonNegativeInteger(get(row,'remainingBalance'));if(remaining!==undefined)point.remainingBalance=remaining
      const description=String(get(row,'description')??'').trim();if(description)point.description=description
      result.points.push(point)
    }
  })
  return result
}
