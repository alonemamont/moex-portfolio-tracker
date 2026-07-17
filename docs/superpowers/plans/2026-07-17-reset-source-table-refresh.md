# Reset-source table refresh implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the purchased-shares cell and source breakdown immediately agree after resetting a single position source.

**Architecture:** `PortfolioTab` changes the persisted `PortfolioFile`; `useCalculatedPositions` derives the displayed total from that file. The regression tests exercise the real component tree and verify both the table cell and breakdown total after each reset type.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library.

## Global Constraints

- Preserve unrelated position sources and all existing reset-flow semantics.
- Do not modify generated Tauri schema files or `Cargo.toml`.

---

### Task 1: Reproduce and guard manual-source reset

**Files:**
- Modify: `webapp/src/components/PortfolioTab.test.tsx`
- Modify: `webapp/src/components/PortfolioTab.tsx` only if the test proves stale derived state.

**Interfaces:**
- Consumes: `PortfolioTab`, `PortfolioProvider`, `SharesOwnedCell`, and `SharesBreakdownPopover`.
- Produces: a UI regression test proving the displayed total is recomputed after manual shares are reset.

- [ ] **Step 1: Write the failing test**

Create a position with `sharesOwned: 5` and broker holding `conn1: 10`; reset the manual source, then assert table total and the popover's `Итого` are both `10`, while source rows show broker `10` and manual `0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PortfolioTab.test.tsx`

Expected: the new assertion exposes the stale table total.

- [ ] **Step 3: Write minimal implementation**

Update only the stale state/data-flow boundary identified by the test so it derives total shares from the updated file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- PortfolioTab.test.tsx`

Expected: all `PortfolioTab` tests pass.

### Task 2: Guard broker-source reset and verify the project

**Files:**
- Modify: `webapp/src/components/PortfolioTab.test.tsx`

**Interfaces:**
- Consumes: the same reset UI flow and calculated position display.
- Produces: a symmetric broker-reset regression test and verified production build.

- [ ] **Step 1: Write the failing test**

Create a position with manual `5`, `conn1: 10`, and `conn2: 7`; reset `conn1`, then assert table total and popover `Итого` are `12`, with rows for `conn2: 7` and manual `5` only.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- PortfolioTab.test.tsx`

Expected: the test demonstrates the same stale-total defect for broker reset if it shares the path.

- [ ] **Step 3: Write minimal implementation**

Extend the Task 1 fix only if required for the broker-reset path.

- [ ] **Step 4: Run verification**

Run: `npm test -- PortfolioTab.test.tsx && npm run build`

Expected: all selected tests and the production build pass.
