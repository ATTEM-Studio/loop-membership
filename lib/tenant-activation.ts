import type {StoreConnection} from './sheets'

const ACTIVE_STATUSES=new Set(['정상','active','활성','사용중'])

export function validateStoreConnection(connection:StoreConnection|null,submittedCode:string){
  if(!connection||!connection.connectionCode.trim())throw new Error('STORE_CONNECTION_NOT_CONFIGURED')
  if(!ACTIVE_STATUSES.has(connection.status.trim().toLowerCase()))throw new Error('STORE_INACTIVE')
  if(connection.connectionCode.trim()!==submittedCode.trim())throw new Error('INVALID_CONNECTION_CODE')
  return connection
}
