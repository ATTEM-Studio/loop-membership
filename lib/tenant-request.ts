import {verifyTenantToken} from './tenant-auth'
import type {SheetContext} from './sheets'

function tenantToken(request:Request){
  const authorization=request.headers.get('authorization')?.trim()
  if(authorization?.toLowerCase().startsWith('bearer '))return authorization.slice(7).trim()
  return request.headers.get('x-loop-tenant-token')?.trim()||''
}

export function getTenantContext(request:Request):SheetContext|undefined{
  const token=tenantToken(request)
  if(!token)return undefined
  const secret=process.env.LOOP_AUTH_SECRET?.trim()
  if(!secret)throw new Error('TENANT_AUTH_NOT_CONFIGURED')
  const payload=verifyTenantToken(token,secret)
  return {spreadsheetId:payload.spreadsheetId}
}
