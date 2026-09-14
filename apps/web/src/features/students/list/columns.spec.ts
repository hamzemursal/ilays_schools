import { describe, it, expect, beforeEach } from "vitest";
import { ALL_OPTIONAL_COLUMN_IDS, COLUMN_DEFS, DEFAULT_VISIBLE_COLUMNS, loadColumnPrefs, saveColumnPrefs } from "./columns";

const STORAGE_KEY = "ilays.studentDirectory.columns.v1";

beforeEach(() => {
  window.localStorage.clear();
});

describe("columns — registry", () => {
  it("every column id is unique", () => {
    const ids = COLUMN_DEFS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every default visible column is a real registered column id", () => {
    const ids = new Set(COLUMN_DEFS.map((c) => c.id));
    for (const id of DEFAULT_VISIBLE_COLUMNS) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("the approved default view has no optional columns checked — only the always-on core columns show", () => {
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual([]);
  });

  it("core columns never appear in the optional registry (they can't be hidden, so there's nothing to toggle)", () => {
    const ids = new Set(COLUMN_DEFS.map((c) => c.id));
    for (const coreId of ["photo", "name", "studentId", "rollNumber", "gender", "attendanceToday"]) {
      expect(ids.has(coreId)).toBe(false);
    }
  });

  it("ALL_OPTIONAL_COLUMN_IDS covers every registered column exactly once", () => {
    expect(ALL_OPTIONAL_COLUMN_IDS).toEqual(COLUMN_DEFS.map((c) => c.id));
  });
});

describe("columns — loadColumnPrefs", () => {
  it("returns the default (empty) set when nothing is stored", () => {
    expect(loadColumnPrefs()).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("returns saved, valid ids from a prior saveColumnPrefs call", () => {
    saveColumnPrefs(["dateOfBirth", "feeStatus"]);
    expect(loadColumnPrefs()).toEqual(["dateOfBirth", "feeStatus"]);
  });

  it("filters out unknown/invented column ids, keeping only the real ones", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["status", "notARealColumn", "feeStatus"]));
    expect(loadColumnPrefs()).toEqual(["status", "feeStatus"]);
  });

  it("filters out ids for columns that are now always-on core columns (a stale preference from before)", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["name", "studentId", "feeStatus"]));
    expect(loadColumnPrefs()).toEqual(["feeStatus"]);
  });

  it("returns an empty array when every stored id is invalid", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["bogus1", "bogus2"]));
    expect(loadColumnPrefs()).toEqual([]);
  });

  it("falls back to the default set when the stored value isn't an array", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));
    expect(loadColumnPrefs()).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("falls back to the default set when the stored value is malformed JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not valid json");
    expect(loadColumnPrefs()).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });
});

describe("columns — saveColumnPrefs", () => {
  it("persists under the expected storage key", () => {
    saveColumnPrefs(["status", "feeStatus"]);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(["status", "feeStatus"]);
  });

  it("round-trips reset-to-default (empty) through save then load", () => {
    saveColumnPrefs(["status"]);
    saveColumnPrefs(DEFAULT_VISIBLE_COLUMNS);
    expect(loadColumnPrefs()).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("round-trips Show All (every optional column) through save then load", () => {
    saveColumnPrefs(ALL_OPTIONAL_COLUMN_IDS);
    expect(loadColumnPrefs()).toEqual(ALL_OPTIONAL_COLUMN_IDS);
  });
});
