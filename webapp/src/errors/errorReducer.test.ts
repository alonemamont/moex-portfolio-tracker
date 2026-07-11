import { describe, it, expect } from "vitest";
import { errorReducer, initialErrorState } from "./errorReducer";

describe("errorReducer", () => {
  it("adds an error with a generated id", () => {
    const state = errorReducer(initialErrorState, { type: "add", source: "update", message: "boom" });
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0]).toMatchObject({ source: "update", message: "boom" });
    expect(state.errors[0].id).toBeTruthy();
  });

  it("removes an error by id", () => {
    const afterAdd = errorReducer(initialErrorState, { type: "add", source: "update", message: "boom" });
    const id = afterAdd.errors[0].id;
    const afterRemove = errorReducer(afterAdd, { type: "clear", id });
    expect(afterRemove.errors).toHaveLength(0);
  });

  it("clears all errors belonging to a source", () => {
    let state = errorReducer(initialErrorState, { type: "add", source: "update", message: "a" });
    state = errorReducer(state, { type: "add", source: "load", message: "b" });
    state = errorReducer(state, { type: "add", source: "update", message: "c" });
    state = errorReducer(state, { type: "clearBySource", source: "update" });
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].source).toBe("load");
  });
});
