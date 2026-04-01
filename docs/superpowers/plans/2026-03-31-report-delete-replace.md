# Report Delete & Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make report deletion permanent (no localStorage soft-delete), replace the REMOVE button with a hover-only red X icon, and ensure only one report per ticker exists globally.

**Architecture:** All changes in `app/page.tsx`. Remove `getDeletedIds` and localStorage tracking, simplify `deleteReport`, add pre-insert delete to `generateReport`, and swap the REMOVE button for a red X that appears on card hover/tap.

**Tech Stack:** React, Supabase JS client, inline styles

---

### Task 1: Remove localStorage soft-delete tracking

**Files:**
- Modify: `app/page.tsx:60-75` (loadReports — remove deleted-ID filtering)
- Modify: `app/page.tsx:136-148` (remove `getDeletedIds`, simplify `deleteReport`)

- [ ] **Step 1: Remove `getDeletedIds` helper and simplify `deleteReport`**

Replace lines 136-148:

```tsx
  const getDeletedIds = (): string[] => {
    try {
      const stored = localStorage.getItem('sanctum-deleted-reports')
      return stored ? JSON.parse(stored) : []
    } catch { return [] }
  }

  const deleteReport = async (id: string) => {
    await supabase.from('reports').delete().eq('id', id)
    const deleted = getDeletedIds()
    localStorage.setItem('sanctum-deleted-reports', JSON.stringify([...deleted, id]))
    setSavedReports(prev => prev.filter(r => r.id !== id))
  }
```

With:

```tsx
  const deleteReport = async (id: string) => {
    await supabase.from('reports').delete().eq('id', id)
    setSavedReports(prev => prev.filter(r => r.id !== id))
  }
```

- [ ] **Step 2: Simplify `loadReports` to remove deleted-ID filtering**

Replace the `loadReports` callback (lines 60-75):

```tsx
  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) {
      const deleted = (() => {
        try {
          const stored = localStorage.getItem('sanctum-deleted-reports')
          return stored ? JSON.parse(stored) : []
        } catch { return [] }
      })()
      setSavedReports(data.filter((r: SavedReport) => !deleted.includes(r.id)))
    }
  }, [])
```

With:

```tsx
  const loadReports = useCallback(async () => {
    const { data } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setSavedReports(data)
  }, [])
```

- [ ] **Step 3: Verify the app compiles**

Run: `cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx next build 2>&1 | tail -5`
Expected: Build succeeds (or at least no errors related to `getDeletedIds` or `sanctum-deleted-reports`)

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "refactor: remove localStorage soft-delete tracking for reports"
```

---

### Task 2: Add global ticker replacement in `generateReport`

**Files:**
- Modify: `app/page.tsx:151-206` (generateReport function)

- [ ] **Step 1: Add delete-before-insert to `generateReport`**

In the `generateReport` function, insert the following line immediately before the `const { data: inserted, error: insertError } = await supabase` block (after line 170 `const ticker = searchTicker.trim().toUpperCase()`):

```tsx
      // Delete any existing reports for this ticker globally
      await supabase.from('reports').delete().eq('ticker', ticker)
```

The resulting code around that area should read:

```tsx
      const { data, ai } = await res.json()
      const ticker = searchTicker.trim().toUpperCase()

      // Delete any existing reports for this ticker globally
      await supabase.from('reports').delete().eq('ticker', ticker)

      const { data: inserted, error: insertError } = await supabase
        .from('reports')
        .insert({
```

- [ ] **Step 2: Verify the app compiles**

Run: `cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace existing report when generating for same ticker"
```

---

### Task 3: Replace REMOVE button with hover-only red X icon

**Files:**
- Modify: `app/page.tsx:634-663` (card onMouseEnter/onMouseLeave handlers)
- Modify: `app/page.tsx:957-991` (footer with REMOVE button)

- [ ] **Step 1: Add delete button show/hide to card hover handlers**

In the card's `onMouseEnter` handler (around line 634), add after the highlights logic (after the `if (highlights)` block closes):

```tsx
                          const deleteBtn = el.querySelector('[data-delete-btn]') as HTMLElement | null
                          if (deleteBtn) deleteBtn.style.opacity = '1'
```

In the card's `onMouseLeave` handler (around line 649), add after the highlights logic:

```tsx
                          const deleteBtn = el.querySelector('[data-delete-btn]') as HTMLElement | null
                          if (deleteBtn) deleteBtn.style.opacity = '0'
```

- [ ] **Step 2: Replace the REMOVE button with a red X icon**

Replace the entire footer section (lines 957-991):

```tsx
                        {/* Footer: Date | Created by + Remove */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          paddingTop: 12,
                          borderTop: '1px solid #1a1a1a',
                        }}>
                          <span style={{
                            fontSize: 11, color: '#333',
                            fontFamily: "'JetBrains Mono', monospace",
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}>
                            {new Date(report.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric',
                            })}
                            <span style={{ color: '#222', margin: '0 6px' }}>|</span>
                            <span style={{ color: '#444' }}>{creatorName}</span>
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); deleteReport(report.id) }}
                            style={{
                              background: 'none', border: '1px solid #1a1a1a',
                              borderRadius: 3, color: '#444', fontSize: 10,
                              padding: '4px 10px', cursor: 'pointer',
                              fontFamily: "'JetBrains Mono', monospace",
                              letterSpacing: '0.05em',
                              transition: 'all 0.2s ease',
                              flexShrink: 0,
                            }}
                            onMouseEnter={e => { (e.currentTarget).style.color = '#f87171'; (e.currentTarget).style.borderColor = 'rgba(248,113,113,0.3)' }}
                            onMouseLeave={e => { (e.currentTarget).style.color = '#444'; (e.currentTarget).style.borderColor = '#1a1a1a' }}
                          >
                            REMOVE
                          </button>
                        </div>
```

With:

```tsx
                        {/* Footer: Date | Created by */}
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          paddingTop: 12,
                          borderTop: '1px solid #1a1a1a',
                        }}>
                          <span style={{
                            fontSize: 11, color: '#333',
                            fontFamily: "'JetBrains Mono', monospace",
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            minWidth: 0,
                          }}>
                            {new Date(report.created_at).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric',
                            })}
                            <span style={{ color: '#222', margin: '0 6px' }}>|</span>
                            <span style={{ color: '#444' }}>{creatorName}</span>
                          </span>
                        </div>

                        {/* Delete X — visible on hover/tap */}
                        <button
                          data-delete-btn
                          onClick={e => { e.stopPropagation(); deleteReport(report.id) }}
                          onTouchStart={e => { e.stopPropagation() }}
                          style={{
                            position: 'absolute',
                            top: 8,
                            right: 8,
                            background: 'rgba(0,0,0,0.6)',
                            border: 'none',
                            borderRadius: '50%',
                            width: 22,
                            height: 22,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            opacity: 0,
                            transition: 'opacity 0.2s ease, transform 0.15s ease, background 0.15s ease',
                            zIndex: 5,
                            padding: 0,
                            lineHeight: 1,
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.transform = 'scale(1.15)'
                            e.currentTarget.style.background = 'rgba(248,113,113,0.25)'
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.transform = 'scale(1)'
                            e.currentTarget.style.background = 'rgba(0,0,0,0.6)'
                          }}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round">
                            <line x1="2" y1="2" x2="10" y2="10" />
                            <line x1="10" y1="2" x2="2" y2="10" />
                          </svg>
                        </button>
```

- [ ] **Step 3: Add mobile tap-to-reveal support**

The card already has `position: relative` (line 625), so the absolute-positioned X will work. For mobile tap-to-reveal, the card's `onClick` handler already exists. We need to show the delete button on touch. Add to the card's opening `<div>` (the one with `key={report.id}`), right after the existing `onClick` handler:

```tsx
                        onTouchStart={e => {
                          const deleteBtn = e.currentTarget.querySelector('[data-delete-btn]') as HTMLElement | null
                          if (deleteBtn) {
                            const isVisible = deleteBtn.style.opacity === '1'
                            deleteBtn.style.opacity = isVisible ? '0' : '1'
                          }
                        }}
```

Note: This toggles the X visibility on tap without interfering with the card click (which opens the report). The `onTouchStart` on the delete button itself has `e.stopPropagation()` to prevent the toggle when tapping the X.

- [ ] **Step 4: Verify the app compiles**

Run: `cd "/Users/kev/Library/Mobile Documents/com~apple~CloudDocs/Finance/sanctum securities" && npx next build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx
git commit -m "feat: replace REMOVE button with hover-only red X icon"
```
