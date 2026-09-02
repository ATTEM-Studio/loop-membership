import {NextResponse} from 'next/server'
import {maskPhone,type Customer} from '../../../lib/domain'
import {planImport} from '../../../lib/import-merge'
import {applyImportPlan,hasImportPayloadHash} from '../../../lib/import-sheets'
import {buildImportPreview,stableImportHash,validateImportCommit} from '../../../lib/import-service'
import type {DuplicateResolution,NormalizedImportPayload} from '../../../lib/import-types'
import {isAdminPin} from '../../../lib/member-service'
import {readCustomers} from '../../../lib/sheets'
import {getTenantContext} from '../../../lib/tenant-request'

type ImportRequest={
  action?:'preview'|'commit'
  pin?:string
  payload?:NormalizedImportPayload
  resolutions?:DuplicateResolution[]
  acknowledged?:boolean
  importId?:string
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

function statusFor(message:string){
  if(message==='INVALID_PIN')return 401
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED')return 503
  if(message==='IMPORT_ALREADY_APPLIED')return 409
  if(['IMPORT_CONFIRM_REQUIRED','DUPLICATE_RESOLUTION_REQUIRED','INVALID_IMPORT_PHONE','INVALID_IMPORT_VISITS','INVALID_IMPORT_BALANCE','INVALID_IMPORT_DATE','INVALID_IMPORT_PAYMENT_AMOUNT','INVALID_IMPORT_DELTA','INVALID_IMPORT_BALANCE_TARGET','IMPORT_HAS_BLOCKING_ISSUES'].includes(message))return 400
  return 500
}

export async function POST(request:Request){
  try{
    const body=await request.json() as ImportRequest
    const context=getTenantContext(request)
    if(!isAdminPin(body.pin??''))throw new Error('INVALID_PIN')
    if(!body.payload)throw new Error('IMPORT_HAS_BLOCKING_ISSUES')
    const customers=await readCustomers(context)

    if((body.action??'preview')==='preview'){
      const preview=buildImportPreview(customers,body.payload)
      return NextResponse.json({preview,storage:'google-sheets'})
    }

    const resolutions=Array.isArray(body.resolutions)?body.resolutions:[]
    validateImportCommit(customers,body.payload,resolutions,body.acknowledged===true)
    const hash=stableImportHash(body.payload,resolutions)
    if(await hasImportPayloadHash(hash,context))throw new Error('IMPORT_ALREADY_APPLIED')
    const importId=(body.importId?.trim()||crypto.randomUUID().slice(0,8)).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,24)||crypto.randomUUID().slice(0,8)
    const plan=planImport(customers,body.payload,resolutions,new Date().toISOString(),importId)
    if(plan.blockingIssues.length)throw new Error('IMPORT_HAS_BLOCKING_ISSUES')
    const imported=await applyImportPlan(plan,hash,importId,context)
    const refreshed=await readCustomers(context)
    return NextResponse.json({
      importId,
      summary:imported.summary,
      customers:refreshed.map(adminCustomer),
      storage:'google-sheets',
    })
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message,storage:'google-sheets'},{status:statusFor(message)})
  }
}
