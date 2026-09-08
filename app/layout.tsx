import './globals.css'
import './admin-detail.css'
import './earning-modes.css'
import './import-wizard.css'
import './pwa.css'
import './native-retail.css'
import type {Metadata,Viewport} from 'next'
import AdminImportPortal from './components/AdminImportPortal'
import PwaBootstrap from './components/PwaBootstrap'
import PwaInstallButton from './components/PwaInstallButton'
import {LOOP_THEME_COLOR} from '../lib/pwa'

export const metadata:Metadata={
  title:'Loop — 매장 멤버십',
  description:'고객의 재방문을 만드는 매장용 멤버십',
  applicationName:'LOOP',
  manifest:'/manifest.webmanifest',
  appleWebApp:{capable:true,statusBarStyle:'default',title:'LOOP'},
  formatDetection:{telephone:false},
}

export const viewport:Viewport={
  themeColor:LOOP_THEME_COLOR,
  viewportFit:'cover',
}

export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){
  return <html lang="ko"><body><PwaBootstrap/>{children}<PwaInstallButton/><AdminImportPortal/></body></html>
}
