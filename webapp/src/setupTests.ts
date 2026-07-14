import { expect } from "vitest";
import "@testing-library/jest-dom/vitest";
import { toHaveNoViolations } from "vitest-axe/matchers";

// vitest-axe@0.1.0's own "vitest-axe/extend-expect" entry point ships empty
// (packaging bug), so the matcher is registered manually here instead.
expect.extend({ toHaveNoViolations });
