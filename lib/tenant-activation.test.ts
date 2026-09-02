import {describe,expect,it} from 'vitest'
import {validateStoreConnection} from './tenant-activation'

const connection={storeName:'꿈카페',connectionCode:'LOOP-CAFE-4821',status:'정상',appName:'꿈카페 멤버십'}

describe('store activation validation',()=>{
  it('returns active connection details for the correct code',()=>{
    expect(validateStoreConnection(connection,'LOOP-CAFE-4821')).toEqual(connection)
  })

  it('rejects an incorrect connection code',()=>{
    expect(()=>validateStoreConnection(connection,'WRONG-CODE')).toThrow('INVALID_CONNECTION_CODE')
  })

  it('rejects a missing connection configuration',()=>{
    expect(()=>validateStoreConnection(null,'LOOP-CAFE-4821')).toThrow('STORE_CONNECTION_NOT_CONFIGURED')
  })

  it('rejects an inactive store',()=>{
    expect(()=>validateStoreConnection({...connection,status:'중지'},'LOOP-CAFE-4821')).toThrow('STORE_INACTIVE')
  })
})
