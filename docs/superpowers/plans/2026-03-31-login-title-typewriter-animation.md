# Login Title Typewriter Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "SANCTUM SECURITIES" login title with a typewriter animation that blinks a caret for 4 seconds, types "SANCTUM" in JetBrains Mono at variable speed, then blinks the caret forever.

**Architecture:** Single-component change to `components/Auth.tsx`. Two new `useState` hooks (`displayedText`, `caretVisible`) drive the render. A single `useEffect` on mount orchestrates three phases using `setTimeout`/`setInterval`, with all timer IDs tracked in a `useRef` for cleanup on unmount.

**Tech Stack:** React 18 (useState, useEffect, useRef), TypeScript, existing JetBrains Mono font

---

## File Structure

- **Modify:** `components/Auth.tsx` — add state, ref, useEffect for animation logic; replace the `<h1>` title block

No new files needed. No new dependencies.

---

### Task 1: Add animation state and timer ref

**Files:**
- Modify: `components/Auth.tsx:1-4` (imports) and `components/Auth.tsx:17-21` (state declarations)

- [ ] **Step 1: Update the React import to include `useEffect` and `useRef`**

Change line 3 of `components/Auth.tsx` from:

```tsx
import { useState } from 'react'
```

to:

```tsx
import { useState, useEffect, useRef } from 'react'
```

- [ ] **Step 2: Add animation state and timer ref after existing state declarations**

After line 21 (`const [error, setError] = useState('')`), add:

```tsx
const [displayedText, setDisplayedText] = useState('')
const [caretVisible, setCaretVisible] = useState(false)
const timersRef = useRef<(ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>)[]>([])
```

- [ ] **Step 3: Verify the app still compiles**

Run: `cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx next build 2>&1 | tail -5`
Expected: Build succeeds (unused variables are warnings, not errors in Next.js)

- [ ] **Step 4: Commit**

```bash
git add components/Auth.tsx
git commit -m "feat: add typewriter animation state and timer ref to Auth"
```

---

### Task 2: Implement the three-phase animation useEffect

**Files:**
- Modify: `components/Auth.tsx` — add `useEffect` block after the timer ref declaration

- [ ] **Step 1: Add the useEffect with all three animation phases**

After the `timersRef` declaration (added in Task 1), add:

```tsx
useEffect(() => {
  const timers = timersRef.current

  // Helper to track timers for cleanup
  const addTimeout = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms)
    timers.push(id)
    return id
  }
  const addInterval = (fn: () => void, ms: number) => {
    const id = setInterval(fn, ms)
    timers.push(id)
    return id
  }

  // Phase 1: Idle blink for 4 seconds
  const blinkInterval = addInterval(() => {
    setCaretVisible(v => !v)
  }, 530)

  setCaretVisible(true)

  addTimeout(() => {
    // End Phase 1
    clearInterval(blinkInterval)
    setCaretVisible(true)

    // Phase 2: Type "SANCTUM" one character at a time
    const text = 'SANCTUM'
    let charIndex = 0

    const typeNextChar = () => {
      charIndex++
      setDisplayedText(text.slice(0, charIndex))

      if (charIndex < text.length) {
        const delay = 120 + Math.random() * 170 // 120-290ms
        addTimeout(typeNextChar, delay)
      } else {
        // Phase 3: Rest blink after 300ms pause
        addTimeout(() => {
          addInterval(() => {
            setCaretVisible(v => !v)
          }, 530)
        }, 300)
      }
    }

    const firstDelay = 120 + Math.random() * 170
    addTimeout(typeNextChar, firstDelay)
  }, 4000)

  // Cleanup all timers on unmount
  return () => {
    timers.forEach(id => {
      clearTimeout(id as ReturnType<typeof setTimeout>)
      clearInterval(id as ReturnType<typeof setInterval>)
    })
  }
}, [])
```

- [ ] **Step 2: Verify the app still compiles**

Run: `cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add components/Auth.tsx
git commit -m "feat: add three-phase typewriter animation useEffect"
```

---

### Task 3: Replace the title JSX

**Files:**
- Modify: `components/Auth.tsx:73-82` (the header/h1 block)

- [ ] **Step 1: Replace the static h1 with the animated title**

Replace lines 73-82:

```tsx
        <div className="text-center mb-12">
          <h1 style={{
            fontSize: 48, fontWeight: 700, color: '#fff',
            letterSpacing: '0.08em',
            fontFamily: "'Instrument Serif', serif",
            margin: 0, lineHeight: 1,
          }}>
            SANCTUM SECURITIES
          </h1>
        </div>
```

with:

```tsx
        <div className="text-center mb-12">
          <h1 style={{
            fontSize: 48, fontWeight: 700, color: '#fff',
            letterSpacing: '0.08em',
            fontFamily: "'JetBrains Mono', monospace",
            margin: 0, lineHeight: 1,
          }}>
            {displayedText}
            <span style={{ fontWeight: 300, opacity: caretVisible ? 1 : 0 }}>|</span>
          </h1>
        </div>
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx next build 2>&1 | tail -5`
Expected: Build succeeds with no errors

- [ ] **Step 3: Commit**

```bash
git add components/Auth.tsx
git commit -m "feat: replace static title with typewriter animation"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server and verify in browser**

Run: `cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx next dev`

Open `http://localhost:3000` in a browser. Verify:

1. Page loads with blank title area, just a blinking white caret `|`
2. Caret blinks at a steady rhythm for ~4 seconds
3. Caret stops blinking, stays solid, and "SANCTUM" types out one letter at a time with slight speed variation
4. After "SANCTUM" finishes, brief pause, then caret resumes blinking forever
5. Refreshing the page replays the full animation
6. The text is in JetBrains Mono (monospace), bold, white, with letter spacing
7. The existing fade-in animation on the content wrapper still works (title area fades in as normal, then the typewriter plays within it)
8. Form inputs, error messages, and sign-in button are unaffected

- [ ] **Step 2: Final commit**

```bash
git add components/Auth.tsx
git commit -m "feat: login title typewriter animation complete"
```
