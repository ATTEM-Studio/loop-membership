import './globals.css'
import './admin-detail.css'
import './earning-modes.css'
import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Loop — 매장 멤버십', description: '고객의 재방문을 만드는 매장용 멤버십' }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html> }
