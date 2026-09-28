import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useClassesByYear, useYearClasses } from "./useYearClasses";

const apiMock = vi.hoisted(() => ({ listClasses: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const cls = (id: string) => ({ id, name: id, level: 1, division: { id: "d", type: "SECONDARY" }, sections: [], _count: { classSubjects: 0 } });

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.listClasses.mockImplementation((_t: string, _s: string, yearId: string) => Promise.resolve([cls(`form1-${yearId}`)]));
});

describe("useYearClasses — classes of the SELECTED academic year", () => {
  it("always asks for the given year (never the current-year default) and follows year changes", async () => {
    const { result, rerender } = renderHook(({ year }) => useYearClasses("t", "school-1", year), { initialProps: { year: "old" } });
    await waitFor(() => expect(result.current.map((c) => c.id)).toEqual(["form1-old"]));
    expect(apiMock.listClasses).toHaveBeenCalledWith("t", "school-1", "old");

    rerender({ year: "new" });
    // Never shows the previous year's classes while the new year loads.
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current.map((c) => c.id)).toEqual(["form1-new"]));
  });

  it("loads nothing until a year is chosen", () => {
    const { result } = renderHook(() => useYearClasses("t", "school-1", ""));
    expect(result.current).toEqual([]);
    expect(apiMock.listClasses).not.toHaveBeenCalled();
  });

  it("useClassesByYear loads every row's own year", async () => {
    const { result } = renderHook(() => useClassesByYear("t", "school-1", ["y1", "y2", "y1", ""]));
    await waitFor(() => expect(Object.keys(result.current).sort()).toEqual(["y1", "y2"]));
    expect(result.current.y2.map((c) => c.id)).toEqual(["form1-y2"]);
    expect(apiMock.listClasses).toHaveBeenCalledTimes(2);
  });
});
