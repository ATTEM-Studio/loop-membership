import React from 'react'
import {ImageResponse} from 'next/og'

const VALID_SIZES=new Set([192,512])

export async function GET(request:Request,{params}:{params:Promise<{size:string}>}){
  const {size:rawSize}=await params
  const size=Number(rawSize)
  if(!VALID_SIZES.has(size))return new Response('Not Found',{status:404})

  const isMaskable=new URL(request.url).searchParams.get('purpose')==='maskable'
  const markSize=Math.round(size*(isMaskable?.48:.58))
  const radius=Math.round(markSize*.27)
  const fontSize=Math.round(markSize*.52)

  return new ImageResponse(
    React.createElement('div',{
      style:{
        width:'100%',height:'100%',display:'flex',alignItems:'center',justifyContent:'center',
        background:'#0A84FF',fontFamily:'Arial, sans-serif',
      },
    },React.createElement('div',{
      style:{
        width:markSize,height:markSize,borderRadius:radius,background:'#FFFFFF',color:'#0A84FF',
        display:'flex',alignItems:'center',justifyContent:'center',fontSize,fontWeight:800,
        letterSpacing:'-0.08em',boxShadow:'0 10px 30px rgba(0,0,0,.12)',
      },
    },'L')),
    {width:size,height:size},
  )
}
