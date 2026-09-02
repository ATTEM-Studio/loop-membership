import {createHmac,timingSafeEqual} from 'node:crypto'

export type TenantTokenPayload={
  spreadsheetId:string
  deviceId:string
  issuedAt:number
  version:1
}

function encode(value:string|Buffer){
  return Buffer.from(value).toString('base64url')
}

function decode(value:string){
  return Buffer.from(value,'base64url').toString('utf8')
}

function assertSecret(secret:string){
  if(!secret.trim())throw new Error('INVALID_TENANT_TOKEN')
}

function isValidId(value:string){
  return /^[A-Za-z0-9_-]+$/.test(value)
}

function assertPayload(value:unknown):asserts value is TenantTokenPayload{
  if(!value||typeof value!=='object')throw new Error('INVALID_TENANT_TOKEN')
  const payload=value as Partial<TenantTokenPayload>
  if(payload.version!==1||typeof payload.spreadsheetId!=='string'||!isValidId(payload.spreadsheetId)
    ||typeof payload.deviceId!=='string'||!payload.deviceId.trim()||typeof payload.issuedAt!=='number'||!Number.isFinite(payload.issuedAt)){
    throw new Error('INVALID_TENANT_TOKEN')
  }
}

export function createTenantToken(payload:TenantTokenPayload,secret:string){
  assertSecret(secret)
  assertPayload(payload)
  const encodedPayload=encode(JSON.stringify(payload))
  const signature=encode(createHmac('sha256',secret).update(encodedPayload).digest())
  return `${encodedPayload}.${signature}`
}

export function verifyTenantToken(token:string,secret:string){
  try{
    assertSecret(secret)
    const [encodedPayload,encodedSignature,...extra]=token.split('.')
    if(!encodedPayload||!encodedSignature||extra.length)throw new Error('INVALID_TENANT_TOKEN')
    const expected=createHmac('sha256',secret).update(encodedPayload).digest()
    const received=Buffer.from(encodedSignature,'base64url')
    if(received.length!==expected.length||!timingSafeEqual(received,expected))throw new Error('INVALID_TENANT_TOKEN')
    const payload=JSON.parse(decode(encodedPayload)) as unknown
    assertPayload(payload)
    return payload
  }catch(error){
    if(error instanceof Error&&error.message==='INVALID_TENANT_TOKEN')throw error
    throw new Error('INVALID_TENANT_TOKEN')
  }
}

export function extractSpreadsheetId(value:string){
  const input=value.trim()
  const urlMatch=input.match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/)
  const id=urlMatch?.[1]??input
  if(!isValidId(id))throw new Error('INVALID_SPREADSHEET_ID')
  return id
}
