# Loading Screen Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static loading screen in StockReport.tsx with a typewriter animation, hybrid progress bar, and CRT powerdown exit transition.

**Architecture:** All changes are in a single file — `components/reports/StockReport.tsx`. The loading UI (lines 136-181) gets replaced with a new `ReportLoadingScreen` component that handles the typewriter cycle, progress bar, and CRT transition. The component accepts `ticker` (for phrase interpolation) and `onTransitionDone` callback. The parent component orchestrates: when `loading` becomes false (report data ready), it signals the loading screen to run the CRT exit, then unmounts it.

**Tech Stack:** React (useState/useEffect/useRef/useCallback), CSS keyframe animations (inline `<style>`), no new dependencies.

---

### Task 1: Add the loading phrase list and state management

**Files:**
- Modify: `components/reports/StockReport.tsx:21-26` (replace LOADING_LINES), `components/reports/StockReport.tsx:67-73` (add state)

- [ ] **Step 1: Replace the LOADING_LINES constant with the new phrase list**

Replace lines 21-26:

```tsx
const LOADING_PHRASES = [
  'INITIALIZING SANCTUM AI ENGINE...',
  'FETCHING INSTITUTIONAL DATA FOR {TICKER}...',
  'RUNNING VALUATION MODELS...',
  'GENERATING INSTITUTIONAL REPORT...',
  'AUTHENTICATING DATA SOURCES...',
  'PARSING FINANCIAL STATEMENTS...',
  'ANALYZING INSIDER TRANSACTIONS...',
  'SCORING FUNDAMENTAL STRENGTH...',
  'SIMULATING MARKET STRESS CONDITIONS...',
  'GENERATING ACTIONABLE INSIGHTS...',
  'CALCULATING RISK EXPOSURE...',
  'IDENTIFYING MISPRICING SIGNALS...',
]
```

- [ ] **Step 2: Add new state variables for the transition flow**

In the `StockReport` component, after the existing state declarations (line 73), add:

```tsx
const [showCRT, setShowCRT] = useState(false)
const [reportReady, setReportReady] = useState(false)
const [showReport, setShowReport] = useState(false)
```

- [ ] **Step 3: Update fetchReport to use the transition flow**

Replace the `setLoading(false)` calls in `fetchReport` so that when data arrives, the loading screen gets time to run the CRT exit before unmounting. Replace lines 75-118:

```tsx
const fetchReport = useCallback(async () => {
  setLoading(true)
  setError(null)
  setReport(null)
  setReportReady(false)
  setShowCRT(false)
  setShowReport(false)

  const { data: existing } = await supabase
    .from('reports')
    .select('data')
    .eq('ticker', ticker)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing?.data?.companyName) {
    setReport(existing.data as StockReportType)
    setReportReady(true)
    return
  }

  const result = await generateReport(ticker)
  if ('error' in result) {
    setError(result.error)
    setLoading(false)
    return
  }

  setReport(result)
  setReportReady(true)

  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    await supabase.from('reports').delete().eq('ticker', ticker)
    await supabase.from('reports').insert({
      ticker,
      data: result,
      ai: {},
      created_by: session.user.id,
      created_by_email: session.user.email ?? null,
    })
  }
}, [ticker])
```

- [ ] **Step 4: Commit**

```bash
git add components/reports/StockReport.tsx
git commit -m "refactor: add loading phrase list and transition state management"
```

---

### Task 2: Build the typewriter animation

**Files:**
- Modify: `components/reports/StockReport.tsx` (add `useTypewriter` hook before the component)

- [ ] **Step 1: Add the useTypewriter hook**

Add this hook above the `StockReport` component (after the constants, before `CompanyLogo`):

```tsx
function useTypewriter(ticker: string, reportReady: boolean, onComplete: () => void) {
  const [displayText, setDisplayText] = useState('')
  const [caretMode, setCaretMode] = useState<'blink' | 'solid' | 'hidden'>('hidden')
  const [progress, setProgress] = useState(0)
  const abortRef = useRef(false)
  const phrasesRef = useRef(
    LOADING_PHRASES.map(p => p.replace('{TICKER}', ticker.toUpperCase()))
  )

  // Track reportReady so the async loop can see current value
  const reportReadyRef = useRef(reportReady)
  useEffect(() => { reportReadyRef.current = reportReady }, [reportReady])

  // Track onComplete ref to avoid stale closures
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    abortRef.current = false
    const phrases = phrasesRef.current

    const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
      const id = setTimeout(resolve, ms)
      const check = setInterval(() => {
        if (abortRef.current) { clearTimeout(id); clearInterval(check); reject('aborted') }
      }, 50)
      setTimeout(() => clearInterval(check), ms + 100)
    })

    const typeDelay = () => 27 + Math.random() * 45
    const deleteDelay = () => 20 + Math.random() * 33

    const run = async () => {
      try {
        setCaretMode('blink')
        await sleep(500)

        let phraseIdx = 0
        while (!abortRef.current) {
          const phrase = phrases[phraseIdx % phrases.length]

          // Blink 2-3 times
          setCaretMode('blink')
          const blinks = 2 + Math.round(Math.random())
          await sleep(blinks * 1000)

          // Type out
          for (let i = 0; i < phrase.length; i++) {
            if (abortRef.current) return
            setDisplayText(phrase.slice(0, i + 1))
            setCaretMode('solid')
            await sleep(typeDelay())
          }

          // Update progress toward 90%
          const progressPerPhrase = 88 / phrases.length
          setProgress(Math.min(90, (phraseIdx + 1) * progressPerPhrase))

          // If report is ready at this point, jump to 100% and exit
          if (reportReadyRef.current) {
            setProgress(100)
            setCaretMode('blink')
            await sleep(1200)
            onCompleteRef.current()
            return
          }

          // Hold with blinking caret for 3 seconds
          setCaretMode('blink')
          await sleep(3000)

          // Check again after hold
          if (reportReadyRef.current) {
            setProgress(100)
            await sleep(1200)
            onCompleteRef.current()
            return
          }

          // Backspace
          setCaretMode('solid')
          const text = phrase
          for (let i = text.length; i >= 0; i--) {
            if (abortRef.current) return
            setDisplayText(text.slice(0, i))
            setCaretMode('solid')
            await sleep(deleteDelay())
          }

          phraseIdx++
        }
      } catch (e) {
        if (e !== 'aborted') console.error(e)
      }
    }

    run()

    return () => { abortRef.current = true }
  }, [ticker])

  return { displayText, caretMode, progress }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds (the hook isn't used yet, but syntax should be valid)

- [ ] **Step 3: Commit**

```bash
git add components/reports/StockReport.tsx
git commit -m "feat: add useTypewriter hook for loading animation"
```

---

### Task 3: Build the loading screen JSX with progress bar and CRT transition

**Files:**
- Modify: `components/reports/StockReport.tsx:136-181` (replace loading UI)

- [ ] **Step 1: Replace the loading block**

Replace the entire `if (loading)` block (lines 136-181) with:

```tsx
if (loading || showCRT) {
  return (
    <ReportLoadingScreen
      ticker={ticker}
      reportReady={reportReady}
      showCRT={showCRT}
      onCRTStart={() => setShowCRT(true)}
      onCRTDone={() => { setShowCRT(false); setLoading(false); setShowReport(true) }}
    />
  )
}
```

- [ ] **Step 2: Add the ReportLoadingScreen component**

Add this component after the `useTypewriter` hook, before `CompanyLogo`:

```tsx
function ReportLoadingScreen({
  ticker,
  reportReady,
  showCRT,
  onCRTStart,
  onCRTDone,
}: {
  ticker: string
  reportReady: boolean
  showCRT: boolean
  onCRTStart: () => void
  onCRTDone: () => void
}) {
  const { displayText, caretMode, progress } = useTypewriter(ticker, reportReady, onCRTStart)
  const loadingRef = useRef<HTMLDivElement>(null)
  const crtLineRef = useRef<HTMLDivElement>(null)
  const sweepTopRef = useRef<HTMLDivElement>(null)
  const sweepBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showCRT) return
    const loading = loadingRef.current
    const crtLine = crtLineRef.current
    const sweepTop = sweepTopRef.current
    const sweepBottom = sweepBottomRef.current
    if (!loading || !crtLine || !sweepTop || !sweepBottom) return

    // Step 1: Collapse loading screen
    loading.classList.add('crt-collapsing')

    // Step 2: Show CRT line after collapse
    const t1 = setTimeout(() => {
      crtLine.classList.add('crt-line-visible')
    }, 400)

    // Step 3: Sweep white outward, fade line
    const t2 = setTimeout(() => {
      sweepTop.classList.add('crt-sweeping')
      sweepBottom.classList.add('crt-sweeping')
      crtLine.style.transition = 'opacity 400ms ease-out'
      crtLine.style.opacity = '0'
    }, 700)

    // Step 4: Done
    const t3 = setTimeout(() => {
      onCRTDone()
    }, 1400)

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [showCRT, onCRTDone])

  const caretStyle: React.CSSProperties = {
    display: 'inline-block', width: 8, height: 15,
    background: '#555', verticalAlign: 'middle', marginLeft: 2,
    ...(caretMode === 'blink' ? { animation: 'loadingBlink 1s step-end infinite' } : {}),
    ...(caretMode === 'hidden' ? { opacity: 0 } : { opacity: 1 }),
  }

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)', background: '#0a0a0a',
      position: 'relative', overflow: 'hidden',
    }}>
      <style>{`
        @keyframes loadingBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes crtCollapse {
          0%   { transform: scaleY(1) scaleX(1); opacity: 1; filter: brightness(1); }
          50%  { transform: scaleY(0.008) scaleX(1.02); opacity: 1; filter: brightness(2.5); }
          100% { transform: scaleY(0) scaleX(0.5); opacity: 0; filter: brightness(3); }
        }
        .crt-collapsing {
          animation: crtCollapse 500ms cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        .crt-line-visible {
          opacity: 1 !important;
          transition: opacity 150ms ease-out;
        }
        @keyframes sweepUpWhite {
          0%   { height: 0%; opacity: 1; }
          60%  { height: 50%; opacity: 0.8; }
          100% { height: 50%; opacity: 0; }
        }
        @keyframes sweepDownWhite {
          0%   { height: 0%; opacity: 1; }
          60%  { height: 50%; opacity: 0.8; }
          100% { height: 50%; opacity: 0; }
        }
        .crt-sweeping.crt-sweep-top {
          animation: sweepUpWhite 600ms cubic-bezier(0.25, 0, 0.4, 1) forwards;
        }
        .crt-sweeping.crt-sweep-bottom {
          animation: sweepDownWhite 600ms cubic-bezier(0.25, 0, 0.4, 1) forwards;
        }
        @keyframes shimmerSweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>

      {/* Loading content */}
      <div ref={loadingRef} style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 340 }}>
          {/* Terminal line */}
          <div style={{
            fontSize: 13, color: '#555',
            fontFamily: "'JetBrains Mono', monospace",
            height: 20, lineHeight: '20px',
            whiteSpace: 'nowrap', overflow: 'visible',
            textAlign: 'left', alignSelf: 'flex-start',
          }}>
            <span style={{ color: '#444', marginRight: 8 }}>&gt;</span>
            <span>{displayText}</span>
            <span style={caretStyle} />
          </div>

          {/* Progress bar */}
          <div style={{ width: 340, marginTop: 32 }}>
            <div style={{
              width: '100%', height: 1, background: '#1a1a1a',
              borderRadius: 1, overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                height: '100%', width: `${progress}%`, background: '#555',
                borderRadius: 1, transition: 'width 200ms linear',
              }} />
              <div style={{
                position: 'absolute', top: 0, left: 0,
                width: '100%', height: '100%', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '60%', height: '100%',
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 40%, rgba(255,255,255,0.5) 50%, rgba(255,255,255,0.3) 60%, transparent 100%)',
                  animation: 'shimmerSweep 2.5s linear infinite',
                }} />
              </div>
            </div>
            <div style={{
              fontSize: 10, color: progress >= 100 ? '#555' : '#333',
              marginTop: 8, textAlign: 'right', letterSpacing: '0.05em',
              transition: 'color 300ms',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {Math.round(progress)}%
            </div>
          </div>
        </div>
      </div>

      {/* CRT transition elements */}
      <div ref={crtLineRef} style={{
        position: 'absolute', left: 0, right: 0, top: '50%', zIndex: 15,
        height: 2, transform: 'translateY(-50%)',
        background: 'rgba(255,255,255,0.9)',
        boxShadow: '0 0 30px rgba(255,255,255,0.5), 0 0 80px rgba(255,255,255,0.2)',
        opacity: 0, pointerEvents: 'none',
      }} />
      <div ref={sweepTopRef} className="crt-sweep-top" style={{
        position: 'absolute', left: 0, right: 0, bottom: '50%', zIndex: 14,
        background: 'rgba(255,255,255,0.12)',
        pointerEvents: 'none', height: '0%',
      }} />
      <div ref={sweepBottomRef} className="crt-sweep-bottom" style={{
        position: 'absolute', left: 0, right: 0, top: '50%', zIndex: 14,
        background: 'rgba(255,255,255,0.12)',
        pointerEvents: 'none', height: '0%',
      }} />
    </div>
  )
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add components/reports/StockReport.tsx
git commit -m "feat: add typewriter loading screen with progress bar and CRT transition"
```

---

### Task 4: Manual testing and polish

**Files:**
- Modify: `components/reports/StockReport.tsx` (if fixes needed)

- [ ] **Step 1: Start the dev server and test the loading screen**

Run: `npm run dev`

Test by navigating to a ticker that doesn't have a cached report (so it triggers `generateReport`). Verify:
1. Caret blinks 2-3 times before typing starts
2. Phrase types out character-by-character with variance
3. Caret blinks normally for 3 seconds after typing
4. Phrase backspaces smoothly with variance
5. Progress bar fills gradually with shimmer effect
6. When report arrives: progress jumps to 100%, holds ~1.2s
7. CRT collapse → line → white sweep → report appears

- [ ] **Step 2: Test with a cached report (fast load)**

Navigate to a ticker that has a cached Supabase report. The loading screen should still appear briefly, hit 100% quickly, then CRT transition to the report.

- [ ] **Step 3: Test the error state still works**

Force an error (e.g., invalid ticker) and verify the error UI with retry button still renders correctly.

- [ ] **Step 4: Commit final state**

```bash
git add components/reports/StockReport.tsx
git commit -m "feat: complete loading screen redesign with typewriter and CRT transition"
```
