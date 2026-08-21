export type Source = '네이버'|'인스타'|'카카오'|'당근'|'구글'|'지나가다가'
export type Customer = { id:string; phone:string; source?:Source; visits:number; points:number; lastVisit:string }
export const SOURCES: Source[] = ['네이버','인스타','카카오','당근','구글','지나가다가']
export function normalizePhone(value:string){return value.replace(/\D/g,'').slice(-11)}
export function maskPhone(phone:string){const p=normalizePhone(phone); return p.length===11?`${p.slice(0,3)}-${p.slice(3,7)}-****`:p}
export function addVisit(customer:Customer, source?:Source):Customer{return {...customer,source:customer.source??source,visits:customer.visits+1,points:customer.points+1,lastVisit:new Date().toISOString().slice(0,10)}}
