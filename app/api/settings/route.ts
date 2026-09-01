import {NextResponse} from 'next/server'
import {isAdminPin, sanitizeRewards} from '../../../lib/member-service'
import {readRewards, saveRewards} from '../../../lib/sheets'

function errorStatus(message:string){
  if(message==='GOOGLE_SHEETS_NOT_CONFIGURED') return 503
  if(message==='INVALID_PIN') return 401
  if(message==='INVALID_REWARDS') return 400
  return 500
}

export async function GET(){
  try{return NextResponse.json({rewards:await readRewards(),storage:'google-sheets'})}
  catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}

export async function PUT(request:Request){
  try{
    const body=await request.json() as {pin?:string;rewards?:unknown}
    if(!isAdminPin(body.pin??'')) throw new Error('INVALID_PIN')
    const rewards=sanitizeRewards(body.rewards)
    await saveRewards(rewards)
    return NextResponse.json({rewards,storage:'google-sheets'})
  }catch(error){
    const message=error instanceof Error?error.message:'UNKNOWN_ERROR'
    return NextResponse.json({error:message},{status:errorStatus(message)})
  }
}
