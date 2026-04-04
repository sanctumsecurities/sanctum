# Loading Screen Redesign

## Summary

Replace the static 4-line loading screen in `components/reports/StockReport.tsx` with a typewriter-style terminal animation, a hybrid progress bar, and a CRT powerdown exit transition.

## Typewriter Animation

Single line of text with a blinking caret (`>` prompt, left-aligned). The cycle for each phrase:

1. Caret blinks 2-3 times (1s per blink cycle, CSS `step-end`)
2. Types out the phrase character-by-character with human-like variance (27-72ms per keystroke)
3. Caret switches to blinking, holds for 3 seconds
4. Backspaces the phrase smoothly with variance (20-53ms per deletion)
5. Returns to blinking caret, repeats with next phrase

### Phrase List

```
INITIALIZING SANCTUM AI ENGINE...
FETCHING INSTITUTIONAL DATA FOR [TICKER]...
RUNNING VALUATION MODELS...
GENERATING INSTITUTIONAL REPORT...
AUTHENTICATING DATA SOURCES...
PARSING FINANCIAL STATEMENTS...
ANALYZING INSIDER TRANSACTIONS...
SCORING FUNDAMENTAL STRENGTH...
SIMULATING MARKET STRESS CONDITIONS...
GENERATING ACTIONABLE INSIGHTS...
CALCULATING RISK EXPOSURE...
IDENTIFYING MISPRICING SIGNALS...
```

If the report generation takes longer than the full list, loop back to the beginning.

## Progress Bar

- Fixed 340px width, centered below the typewriter text
- 1px track (`#1a1a1a`) with shimmer sweep effect (matching the ticker search bar's `shimmerSweep` animation)
- Hybrid approach (not tied to real server progress):
  - Fills gradually to ~90% across the phrase cycle duration
  - Pauses at ~90% until the actual server response arrives
  - Jumps to 100% on completion
- Percentage label below-right, `10px` font, subtle color (`#333` during loading, `#555` at 100%)
- 100% state holds on screen for ~1.2 seconds before the CRT transition begins

## CRT Powerdown Exit Transition

Sequence when report data is ready and 100% has been shown:

1. **Collapse** (500ms): Loading screen compresses vertically (`scaleY` to 0) with slight horizontal stretch and brightness increase, mimicking CRT shutdown
2. **Line appear** (150ms): Bright horizontal line appears at vertical center (white, with glow box-shadow)
3. **Sweep + fade** (600ms): Faint white overlays (~12% opacity) sweep upward and downward from the center line; line fades out simultaneously
4. **Report reveal** (500ms): Report fades in with 200ms delay as the white dissipates

## Layout

- Full viewport height, `#0a0a0a` background
- Terminal text: 13px, `JetBrains Mono`, color `#555`, left-aligned within centered container
- Prompt `>` in `#444`
- Caret: 8x15px block, `#555`, blinks via CSS `step-end` animation at 1s interval
- Progress bar centered below text

## Files to Modify

- `components/reports/StockReport.tsx` — replace the loading UI (lines ~136-181) with the new typewriter + progress bar + CRT transition component. The loading state logic (`loading`, `setLoading`, `fetchReport`) stays the same.

## What Stays the Same

- `generateReport` server action — no backend changes
- Report fetching logic (check Supabase cache, fallback to generation)
- Error state UI
- Tab switching after report loads

## Reference

- Auth.tsx typing pattern (lines 29-84) for caret blink + typewriter approach
- `.shimmer-underline` in page.tsx (line 1294-1321) for shimmer effect
- Working mockup: `.superpowers/brainstorm/14010-1775297430/content/full-loading-v5.html`
