import type {Source} from './domain'

export type ImportSheetRole='customers'|'visits'|'points'|'ignore'
export type ImportBalanceTarget='visitPoints'|'stamps'|'paymentPoints'|'ignore'
export type DuplicateStrategy='keep-existing'|'use-imported'|'manual'
export type DuplicateField='visits'|'visitPoints'|'stamps'|'paymentPoints'|'lastVisit'|'source'
export type DuplicateFieldChoice='existing'|'imported'

export const MAX_IMPORT_FILE_BYTES=20*1024*1024
export const MAX_IMPORT_SOURCE_ROWS=30000

export type ImportField=
  |'phone'|'externalId'|'visits'|'balance'|'visitPoints'|'stamps'|'paymentPoints'|'lastVisit'|'source'
  |'date'|'paymentAmount'|'delta'|'transactionType'|'remainingBalance'|'description'

export type ImportValidationIssue={
  sheetName:string
  rowNumber:number
  code:string
  message:string
  field?:string
  value?:unknown
  blocking?:boolean
}

export type NormalizedImportCustomer={
  sheetName:string
  rowNumber:number
  phone:string
  externalId?:string
  visits?:number
  visitPoints?:number
  stamps?:number
  paymentPoints?:number
  lastVisit?:string
  source?:Source
}

export type NormalizedImportVisit={
  sheetName:string
  rowNumber:number
  phone:string
  date:string
  paymentAmount?:number
  source?:Source
}

export type NormalizedImportPointEntry={
  sheetName:string
  rowNumber:number
  phone:string
  date:string
  delta:number
  target:Exclude<ImportBalanceTarget,'ignore'>
  remainingBalance?:number
  description?:string
}

export type NormalizedImportPayload={
  fileName:string
  sourceFileHash?:string
  customers:NormalizedImportCustomer[]
  visits:NormalizedImportVisit[]
  pointHistory:NormalizedImportPointEntry[]
  issues:ImportValidationIssue[]
  unsupportedColumns:{sheetName:string;columns:string[]}[]
}

export type DuplicateResolution={
  phone:string
  strategy:DuplicateStrategy
  fields?:Partial<Record<DuplicateField,DuplicateFieldChoice>>
  includeHistoricalRows?:boolean
}

export type ImportSheetMapping={
  sheetName:string
  role:ImportSheetRole
  mappings:Partial<Record<ImportField,string>>
  balanceTargets:Record<string,ImportBalanceTarget>
}

export type ImportSummary={
  analyzedRows:number
  newCustomers:number
  duplicateCustomers:number
  excludedRows:number
  errorRows:number
  visits:number
  visitPoints:number
  stamps:number
  paymentPoints:number
}
