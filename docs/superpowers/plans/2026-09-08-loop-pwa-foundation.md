# LOOP PWA Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LOOP를 Android 태블릿 홈 화면에 설치해 standalone 앱처럼 실행할 수 있는 PWA로 만들고, 기존 Google Sheets/DeviceSession/Capacitor 구조는 그대로 보존한다.

**Architecture:** Next.js App Router의 `manifest.ts`와 ImageResponse 기반 PNG 아이콘 route를 추가하고, 브라우저 install prompt와 Service Worker 등록은 클라이언트 전용 컴포넌트로 분리한다. Service Worker는 정적 Next 번들과 PWA 아이콘만 캐시하며 `/api/*`, HTML document, POST/PUT/DELETE는 캐시하지 않는다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Vitest, Vercel, existing Capacitor Android wrapper

**Spec:** `docs/superpowers/specs/2026-09-08-loop-pwa-first-distribution-design.md`

## Global Constraints

- PWA가 LOOP의 기본 배포 방식이며 Capacitor/Android 프로젝트는 삭제하지 않는다.
- `start_url=/`, `scope=/`, `display=standalone`을 사용한다.
- theme/background color는 `#F3F5F8`을 사용한다.
- Chromium installability를 위해 192×192 PNG와 512×512 PNG를 제공한다.
- 고객 데이터, 전화번호, 포인트 API 응답은 Service Worker Cache Storage에 저장하지 않는다.
- HTML document를 장기 캐시하지 않는다.
- 기존 DeviceSession/token/Google Sheets/API 계약을 변경하지 않는다.

---

## File Structure

### Create

- `lib/pwa.ts` — manifest 객체와 PWA 상수 생성
- `lib/pwa.test.ts` — manifest/캐시 정책 단위 테스트
- `app/manifest.ts` — Next metadata manifest endpoint
- `app/pwa-icon/[size]/route.ts` — 192/512 PNG 아이콘 생성
- `app/components/PwaBootstrap.tsx` — Service Worker 등록
- `app/components/PwaInstallButton.tsx` — 브라우저 설치 프롬프트 UI
- `public/sw.js` — 안전한 정적 자산 캐시 Service Worker

### Modify

- `app/layout.tsx` — manifest/appleWebApp/viewport metadata + bootstrap 연결
- `app/page.tsx` — 설치 가능할 때만 topbar에 설치 버튼 노출
- `app/globals.css` — standalone/safe-area/install-button 스타일

---

### Task 1: PWA Manifest Contract

**Files:**
- Create: `lib/pwa.ts`
- Create: `lib/pwa.test.ts`
- Create: `app/manifest.ts`

**Interfaces:**
- Produces: `buildLoopManifest(): MetadataRoute.Manifest`
- Produces: `LOOP_THEME_COLOR = '#F3F5F8'`

- [ ] **Step 1: Write the failing manifest test**

```ts
import {describe,expect,it} from 'vitest'
import {buildLoopManifest} from './pwa'

describe('buildLoopManifest',()=>{
  it('contains the Chromium installability fields',()=>{
    const manifest=buildLoopManifest()
    expect(manifest.name).toBe('LOOP — 매장 멤버십')
    expect(manifest.short_name).toBe('LOOP')
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({src:'/pwa-icon/192',sizes:'192x192',type:'image/png'}),
      expect.objectContaining({src:'/pwa-icon/512',sizes:'512x512',type:'image/png'}),
    ]))
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- lib/pwa.test.ts`

Expected: FAIL because `lib/pwa.ts` does not exist.

- [ ] **Step 3: Implement the manifest builder**

```ts
import type {MetadataRoute} from 'next'

export const LOOP_THEME_COLOR='#F3F5F8'

export function buildLoopManifest():MetadataRoute.Manifest{
  return {
    id:'/',
    name:'LOOP — 매장 멤버십',
    short_name:'LOOP',
    description:'고객의 재방문을 만드는 매장용 멤버십',
    start_url:'/',
    scope:'/',
    display:'standalone',
    background_color:LOOP_THEME_COLOR,
    theme_color:LOOP_THEME_COLOR,
    categories:['business','productivity'],
    icons:[
      {src:'/pwa-icon/192',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/pwa-icon/512',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/pwa-icon/512?purpose=maskable',sizes:'512x512',type:'image/png',purpose:'maskable'},
    ],
  }
}
```

`app/manifest.ts`:

```ts
import {buildLoopManifest} from '../lib/pwa'

export default function manifest(){
  return buildLoopManifest()
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- lib/pwa.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add LOOP PWA manifest`

---

### Task 2: Runtime PNG App Icons

**Files:**
- Create: `app/pwa-icon/[size]/route.ts`

**Interfaces:**
- Consumes: URL segment `size` with values `192` or `512`
- Produces: `image/png` response suitable for manifest icons

- [ ] **Step 1: Implement strict size validation**

Only `192` and `512` are accepted. Any other size returns 404.

- [ ] **Step 2: Render the LOOP icon using `ImageResponse`**

Use a square `#0A84FF` background with an inner white rounded LOOP mark. Keep all critical icon content within the center safe zone so the 512 image can also be used as `maskable`.

- [ ] **Step 3: Build verification**

Run: `npm run build`

Expected: Next.js compiles `app/pwa-icon/[size]/route.ts` without TypeScript or route-handler errors.

- [ ] **Step 4: Commit**

Commit message: `feat: generate PWA app icons`

---

### Task 3: Layout Metadata and Installed-App Viewport

**Files:**
- Modify: `app/layout.tsx`
- Create: `app/components/PwaBootstrap.tsx`

**Interfaces:**
- Consumes: existing RootLayout
- Produces: manifest link, Apple standalone metadata, theme viewport, Service Worker registration

- [ ] **Step 1: Add metadata**

Update `metadata` with:

```ts
applicationName:'LOOP',
manifest:'/manifest.webmanifest',
appleWebApp:{capable:true,statusBarStyle:'default',title:'LOOP'},
formatDetection:{telephone:false},
```

Add:

```ts
export const viewport:Viewport={
  themeColor:LOOP_THEME_COLOR,
  viewportFit:'cover',
}
```

- [ ] **Step 2: Add PwaBootstrap**

`PwaBootstrap` must be a client component. On mount, register `/sw.js` only when `serviceWorker` exists in `navigator`. Registration failure must not block LOOP usage.

- [ ] **Step 3: Mount PwaBootstrap in RootLayout**

Place it inside `<body>` before the main application children or immediately after them; it renders `null`.

- [ ] **Step 4: Build verification**

Run: `npm run build`

Expected: metadata and client/server component boundaries compile successfully.

- [ ] **Step 5: Commit**

Commit message: `feat: add PWA metadata and bootstrap`

---

### Task 4: Safe Service Worker

**Files:**
- Create: `public/sw.js`
- Modify: `lib/pwa.ts`
- Modify: `lib/pwa.test.ts`

**Interfaces:**
- Produces: `shouldCacheLoopRequest(method, pathname)` pure policy helper for tests
- Service Worker mirrors the same policy in plain JavaScript

- [ ] **Step 1: Write failing cache-policy tests**

Cover at least:

```ts
expect(shouldCacheLoopRequest('GET','/_next/static/chunks/app.js')).toBe(true)
expect(shouldCacheLoopRequest('GET','/pwa-icon/192')).toBe(true)
expect(shouldCacheLoopRequest('GET','/api/members')).toBe(false)
expect(shouldCacheLoopRequest('POST','/api/members')).toBe(false)
expect(shouldCacheLoopRequest('GET','/')).toBe(false)
```

- [ ] **Step 2: Implement pure cache policy**

```ts
export function shouldCacheLoopRequest(method:string,pathname:string){
  if(method!=='GET')return false
  if(pathname.startsWith('/api/'))return false
  return pathname.startsWith('/_next/static/')||pathname.startsWith('/pwa-icon/')
}
```

- [ ] **Step 3: Implement `public/sw.js` with the same allowlist**

Rules:

- `install` → `skipWaiting()`
- `activate` → delete old `loop-static-*` caches and `clients.claim()`
- `fetch` → same-origin GET only
- `/api/*` and HTML document → untouched network path
- `/_next/static/*` and `/pwa-icon/*` → cache-first with network fill

- [ ] **Step 4: Run tests**

Run: `npm test -- lib/pwa.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: add safe PWA static cache`

---

### Task 5: One-Tap Install Button

**Files:**
- Create: `app/components/PwaInstallButton.tsx`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `PwaInstallButton` that renders only while an install prompt is available and the app is not standalone

- [ ] **Step 1: Define the browser event type**

```ts
type BeforeInstallPromptEvent=Event&{
  prompt:()=>Promise<void>
  userChoice:Promise<{outcome:'accepted'|'dismissed';platform:string}>
}
```

- [ ] **Step 2: Capture `beforeinstallprompt`**

Call `event.preventDefault()`, store the event in component state, and hide the button when `matchMedia('(display-mode: standalone)')` is true.

- [ ] **Step 3: Handle the install click**

Call `prompt()`, await `userChoice`, then clear the saved prompt regardless of accepted/dismissed so it cannot nag repeatedly in the same session.

- [ ] **Step 4: Add the install action to the topbar**

Place `PwaInstallButton` beside the existing customer/admin switcher, but style it as a secondary utility action so it never competes with kiosk Primary CTA.

- [ ] **Step 5: Add touch-friendly CSS**

Use minimum 40px hit area, rounded utility styling, and hide the component entirely when it returns null.

- [ ] **Step 6: Build verification**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 7: Commit**

Commit message: `feat: add one-tap PWA installation`

---

### Task 6: Standalone and Safe-Area Polish

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: installed-mode layout that respects Android/iOS safe areas without changing browser-mode behavior

- [ ] **Step 1: Replace critical `100vh` shell assumptions with `100dvh` fallbacks**

Use:

```css
.shell{min-height:100vh;min-height:100dvh}
.kiosk{min-height:calc(100vh - 74px);min-height:calc(100dvh - 74px)}
.connection-page{min-height:100vh;min-height:100dvh}
```

- [ ] **Step 2: Add safe-area support**

Topbar and kiosk bottom padding must include `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` where relevant.

- [ ] **Step 3: Add standalone media query**

```css
@media (display-mode:standalone){
  body{overscroll-behavior:none}
  .topbar{padding-top:env(safe-area-inset-top)}
}
```

Do not hide admin or core navigation solely because the app is installed.

- [ ] **Step 4: Production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `style: polish standalone tablet layout`

---

### Task 7: Regression Verification

**Files:**
- No new production files unless a verification issue requires a targeted fix.

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all existing + new tests PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS.

- [ ] **Step 3: Verify manifest output manually**

After deployment/dev server, verify `/manifest.webmanifest` contains name, short_name, start_url, standalone display, 192 and 512 PNG icon URLs.

- [ ] **Step 4: Verify icon endpoints**

Verify `/pwa-icon/192` and `/pwa-icon/512` return PNG responses.

- [ ] **Step 5: Verify Service Worker policy**

Confirm `/api/members` and other `/api/*` requests are not stored in Cache Storage.

- [ ] **Step 6: Android tablet smoke test**

Chrome/Chromium:

1. Open LOOP over HTTPS.
2. Confirm `홈 화면에 LOOP 설치` appears when installable.
3. Install.
4. Launch from home screen.
5. Confirm address bar is absent.
6. Confirm existing DeviceSession loads the correct store without reconnecting.
7. Perform one customer lookup and one point earn to ensure no behavior regression.

- [ ] **Step 7: Final verification commit only if fixes were required**

Commit message: `fix: finalize LOOP PWA install flow`
