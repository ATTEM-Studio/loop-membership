'use client'

import {useEffect,useState} from 'react'
import {FileSpreadsheet,Upload} from 'lucide-react'
import ImportWizard from './ImportWizard'

export default function AdminImportPortal(){
  const [adminVisible,setAdminVisible]=useState(false)
  const [open,setOpen]=useState(false)

  useEffect(()=>{
    const scan=()=>setAdminVisible(Boolean(document.querySelector('.admin-badge')))
    scan()
    const observer=new MutationObserver(scan)
    observer.observe(document.body,{childList:true,subtree:true})
    return()=>observer.disconnect()
  },[])

  if(!adminVisible&&!open)return null
  return <>
    {adminVisible&&!open&&<button className="admin-import-launcher" onClick={()=>setOpen(true)} aria-label="기존 고객 DB 가져오기"><span className="admin-import-icon"><FileSpreadsheet size={19}/></span><span><strong>기존 고객 DB 가져오기</strong><small>Excel · CSV 변환</small></span><Upload size={16}/></button>}
    <ImportWizard open={open} onClose={()=>setOpen(false)} onImported={()=>window.location.reload()}/>
  </>
}
