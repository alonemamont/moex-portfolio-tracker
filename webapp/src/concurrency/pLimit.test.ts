import { describe, it, expect } from "vitest";
import { pLimit } from "./pLimit";

describe("pLimit", () => {
  it("never runs more than `concurrency` tasks at once", async () => {
    const limit = pLimit(2);
    let active = 0;
    let maxActive = 0;

    const task = () =>
      limit(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active--;
        return active;
      });

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("resolves each task with its own return value", async () => {
    const limit = pLimit(3);
    const results = await Promise.all([
      limit(async () => 1),
      limit(async () => 2),
      limit(async () => 3),
    ]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("propagates individual task rejections without blocking others", async () => {
    const limit = pLimit(2);
    const results = await Promise.allSettled([
      limit(async () => {
        throw new Error("boom");
      }),
      limit(async () => "ok"),
    ]);
    expect(results[0].status).toBe("rejected");
    expect(results[1]).toEqual({ status: "fulfilled", value: "ok" });
  });
});
