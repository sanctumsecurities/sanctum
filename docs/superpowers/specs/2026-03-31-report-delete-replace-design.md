# Report Delete & Replace Design

**Date:** 2026-03-31
**Scope:** Stock card remove button UX + permanent delete + single-report-per-ticker enforcement

## 1. Delete Button UX

Replace the current "REMOVE" text button with a red X icon:

- **Appearance:** Small red `X` icon (e.g. `×` character styled or inline SVG) positioned in the top-right corner of the stock card
- **Visibility:**
  - Hidden by default
  - **Desktop:** Shown on card hover
  - **Mobile:** Shown on card tap (toggle "focused" state; tapping elsewhere dismisses)
- **Interaction:** On hover of the X itself, slight brightness/scale increase for feedback
- **Behavior:** `e.stopPropagation()` preserved so clicking X does not open the report

## 2. True Permanent Delete

- `deleteReport` calls `supabase.from('reports').delete().eq('id', id)` — this already exists
- **Remove** all localStorage `sanctum-deleted-reports` tracking:
  - Remove `getDeletedIds()` helper function
  - Remove localStorage reads/writes referencing `sanctum-deleted-reports`
  - Remove any filtering logic that uses deleted IDs to hide reports
- The Supabase DELETE is the single source of truth — no soft-delete layer

## 3. Replace on Re-generate (Global)

- In `generateReport`, after the `/api/analyze` call succeeds and before inserting the new report:
  1. Delete **all** existing reports for that ticker globally: `supabase.from('reports').delete().eq('ticker', ticker)`
  2. Insert the new report as normal
- One report per ticker across all users — the latest generation always wins
- No schema migration needed; enforced at application level

## Files to Modify

- `app/page.tsx` — delete button UX, deleteReport cleanup, generateReport replace logic

## Out of Scope

- Database unique constraints or schema migrations
- Confirmation dialogs before delete (not requested)
- Undo/restore functionality
