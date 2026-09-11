import { describe, it, expect, vi } from "vitest";
import { runBulkAction, summarizeBulkResult } from "./bulkAction";
import { ApiError } from "./api";

describe("runBulkAction", () => {
  it("runs every id independently — one rejection never blocks or aborts the rest", async () => {
    const action = vi.fn((id: string) => (id === "bad" ? Promise.reject(new Error("boom")) : Promise.resolve()));

    const result = await runBulkAction(["a", "bad", "b"], action);

    expect(action).toHaveBeenCalledTimes(3);
    expect(result.succeededIds).toEqual(["a", "b"]);
    expect(result.failed).toEqual([{ id: "bad", message: "Failed" }]);
  });

  it("uses the ApiError's own message when the rejection is an ApiError", async () => {
    const action = vi.fn(() => Promise.reject(new ApiError("Cannot delete — has enrollments", 400)));

    const result = await runBulkAction(["a"], action);

    expect(result.failed).toEqual([{ id: "a", message: "Cannot delete — has enrollments" }]);
  });

  it("falls back to a generic 'Failed' message for a non-ApiError rejection", async () => {
    const action = vi.fn(() => Promise.reject(new Error("network down")));
    const result = await runBulkAction(["a"], action);
    expect(result.failed).toEqual([{ id: "a", message: "Failed" }]);
  });

  it("returns empty succeeded/failed arrays for an empty id list, without calling action", async () => {
    const action = vi.fn();
    const result = await runBulkAction([], action);
    expect(action).not.toHaveBeenCalled();
    expect(result).toEqual({ succeededIds: [], failed: [] });
  });
});

describe("summarizeBulkResult", () => {
  it("reports only the success count when nothing failed", () => {
    const summary = summarizeBulkResult({ succeededIds: ["a", "b"], failed: [] }, "archived");
    expect(summary).toBe("2 archived");
  });

  it("appends a skipped count with de-duplicated reasons joined by '; '", () => {
    const summary = summarizeBulkResult(
      {
        succeededIds: ["a"],
        failed: [
          { id: "b", message: "Cannot delete — has students" },
          { id: "c", message: "Cannot delete — has students" },
          { id: "d", message: "Cannot delete — has exams" },
        ],
      },
      "archived",
    );
    expect(summary).toBe("1 archived, 3 skipped (Cannot delete — has students; Cannot delete — has exams)");
  });

  it("reports 0 succeeded, not omitting the line, when every id failed", () => {
    const summary = summarizeBulkResult({ succeededIds: [], failed: [{ id: "a", message: "err" }] }, "archived");
    expect(summary).toBe("0 archived, 1 skipped (err)");
  });
});
