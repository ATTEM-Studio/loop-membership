'use client'

import {useEffect,useState} from 'react'
import {Download} from 'lucide-react'

type BeforeInstallPromptEvent=Event&{
  prompt:()=>Promise<void>
  userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>
}

type StandaloneNavigator=Navigator&{standalone?:boolean}

function isStandalone(){
  if(typeof window==='undefined')return false
  return window.matchMedia('(display-mode: standalone)').matches||(navigator as StandaloneNavigator).standalone===true
}

export default function PwaInstallButton(){
  const [promptEvent,setPromptEvent]=useState<BeforeInstallPromptEvent|null>(null)
  const [installed,setInstalled]=useState(false)

  useEffect(()=>{
    setInstalled(isStandalone())
    if(isStandalone())return

    const handlePrompt=(event:Event)=>{
      const installEvent=event as BeforeInstallPromptEvent
      installEvent.preventDefault()
      setPromptEvent(installEvent)
    }
    const handleInstalled=()=>{
      setInstalled(true)
      setPromptEvent(null)
    }

    window.addEventListener('beforeinstallprompt',handlePrompt)
    window.addEventListener('appinstalled',handleInstalled)
    return()=>{
      window.removeEventListener('beforeinstallprompt',handlePrompt)
      window.removeEventListener('appinstalled',handleInstalled)
    }
  },[])

  if(installed||!promptEvent)return null

  const install=async()=>{
    const current=promptEvent
    setPromptEvent(null)
    try{
      await current.prompt()
      await current.userChoice
    }catch{
      // Browser install UI is optional; LOOP must keep working if it fails.
    }
  }

  return <button className="pwa-install-button" onClick={()=>void install()} aria-label="LOOP를 홈 화면에 설치">
    <Download size={16}/><span>홈 화면에 LOOP 설치</span>
  </button>
}
