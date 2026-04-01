# Login Title Typewriter Animation

## Overview

Replace the static "SANCTUM SECURITIES" title on the login page with a typewriter animation that types out "SANCTUM" in a monospace code-style font, preceded by a blinking caret idle period.

## Animation Sequence

The animation plays once per page load (no looping). Three phases:

### Phase 1 — Idle Blink (4 seconds)

- Screen shows only a blinking thin-line caret `|`
- Caret blinks at 530ms on/off rate
- Fixed duration: 4000ms
- Builds anticipation before typing begins

### Phase 2 — Typing

- Types "SANCTUM" one character at a time
- Variable delay per character: 120-290ms (random, for a human feel)
- Caret stays visible (solid) during typing — no blinking
- Total duration: ~0.84-2.03s depending on random values

### Phase 3 — Resting Blink (forever)

- "SANCTUM" is fully displayed
- 300ms pause after last character before blinking resumes
- Caret resumes blinking at 530ms on/off rate
- Runs indefinitely until page unload or navigation

## Styling

| Property        | Value                              |
|-----------------|------------------------------------|
| Font family     | JetBrains Mono (already loaded)    |
| Font weight     | 700 (bold) for text, 300 for caret |
| Font size       | 48px                               |
| Color           | #fff                               |
| Letter spacing  | 0.08em                             |
| Caret character | `\|` (thin line)                   |
| Caret color     | #fff (same as text)                |

## Implementation Approach

Pure React `useEffect` + `setTimeout` chain inside `Auth.tsx`. No new dependencies.

### State

- `displayedText: string` — starts empty, characters appended during Phase 2
- `caretVisible: boolean` — toggled by `setInterval` during Phases 1 and 3

### Logic

Single `useEffect` on mount:

1. Start `setInterval` toggling `caretVisible` every 530ms
2. After 4000ms (`setTimeout`), clear the blink interval, set caret visible, begin typing
3. For each of the 7 characters in "SANCTUM", `setTimeout` with random 120-290ms delay, appending next character to `displayedText`
4. After last character, 300ms pause, then start new `setInterval` for permanent caret blink
5. Return cleanup function that clears all active timers

### JSX Changes

Replace the current `<h1>` block (Instrument Serif, "SANCTUM SECURITIES") with:

```jsx
<h1 style={{
  fontSize: 48, fontWeight: 700, color: '#fff',
  letterSpacing: '0.08em',
  fontFamily: "'JetBrains Mono', monospace",
  margin: 0, lineHeight: 1,
}}>
  {displayedText}
  <span style={{ fontWeight: 300, opacity: caretVisible ? 1 : 0 }}>|</span>
</h1>
```

## What Stays the Same

- Existing `motion.div` fade-in wrapper around the title area
- Floating orbs background animation
- Form inputs, error animations, button styling
- JetBrains Mono font already loaded in `layout.tsx`

## Edge Cases

- **Unmount during animation**: All `setTimeout`/`setInterval` IDs tracked in refs and cleared in `useEffect` cleanup to prevent memory leaks
- **No looping**: Plays once per mount, stays in Phase 3
- **No "SECURITIES"**: Title is just "SANCTUM" — the word "SECURITIES" is removed entirely
