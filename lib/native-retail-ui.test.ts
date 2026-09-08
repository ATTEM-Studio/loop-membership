import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,expect,it} from 'vitest'

const root=resolve(process.cwd())
const read=(path:string)=>readFileSync(resolve(root,path),'utf8')

describe('LOOP Native Retail UI style contract',()=>{
  it('loads the Native Retail override after the PWA layer',()=>{
    const layout=read('app/layout.tsx')
    const pwaIndex=layout.indexOf("import './pwa.css'")
    const nativeIndex=layout.indexOf("import './native-retail.css'")
    expect(pwaIndex).toBeGreaterThan(-1)
    expect(nativeIndex).toBeGreaterThan(pwaIndex)
  })

  it('keeps core Native Retail tokens and accessibility states',()=>{
    const css=read('app/native-retail.css')
    expect(css).toContain('--loop-primary:#0a84ff')
    expect(css).toContain('--loop-radius-xl:28px')
    expect(css).toContain(':focus-visible')
    expect(css).toContain('@media(prefers-reduced-motion:reduce)')
  })

  it('keeps kiosk primary and secondary actions visually distinct',()=>{
    const css=read('app/native-retail.css')
    expect(css).toContain('.action-card.earn')
    expect(css).toContain('.action-card.redeem')
    expect(css).toContain('background:linear-gradient(155deg,#138dff 0%,#0876e7 100%)')
  })
})
