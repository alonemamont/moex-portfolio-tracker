# Orphan broker holdings implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete a broker connection together with its holdings or retain them as explicitly resettable orphan holdings.

**Architecture:** `BrokerConnectionsModal` owns the removal confirmation and returns a new `PortfolioFile` with optional holding cleanup. `PortfolioTab` identifies holdings whose connection IDs are absent from `brokerConnections` and presents them as a separate reset source.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library.

## Global Constraints

- The removal checkbox defaults to deleting the connection's holdings.
- Retained holdings preserve their numeric contribution until the user resets `Удалённые holdings`.
- Existing manual and active-broker reset behavior remains unchanged.

---

### Task 1: Test and implement connection removal choices

**Files:**
- Modify: `webapp/src/components/BrokerConnectionsModal.tsx`
- Modify: `webapp/src/components/BrokerConnectionsModal.test.tsx`

- [ ] Write failing UI tests for the default checked option removing holdings and for an unchecked option retaining them.
- [ ] Run `npm test -- BrokerConnectionsModal.test.tsx` and observe both failures because removal is currently immediate.
- [ ] Add a confirmation modal with `Удалить вместе с позициями`, checked by default; filter matching holdings only when checked.
- [ ] Re-run `npm test -- BrokerConnectionsModal.test.tsx` and observe passing tests.

### Task 2: Test and implement orphan-holdings reset

**Files:**
- Modify: `webapp/src/components/PortfolioTab.tsx`
- Modify: `webapp/src/components/PortfolioTab.test.tsx`

- [ ] Write a failing UI test with an orphan holding and assert that `Удалённые holdings (1)` is selectable and clears only the orphan record.
- [ ] Run `npm test -- PortfolioTab.test.tsx` and observe the missing source option.
- [ ] Add orphan detection from connection IDs, confirmation text, details, and removal logic.
- [ ] Re-run `npm test -- PortfolioTab.test.tsx` and observe passing tests.

### Task 3: Verify and publish

- [ ] Run `npm test` and `npm run build`.
- [ ] Commit only the implementation, tests, and plan; push `master` to `origin`.
