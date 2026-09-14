import { describe, it, expect, beforeEach } from "vitest";
import { COLUMN_DEFS, DEFAULT_VISIBLE_COLUMNS, loadColumnPrefs, saveColumnPrefs } from "./columns";

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
});

describe("columns — loadColumnPrefs", () => {
  it("returns the default set when nothing is stored", () => {
    expect(loadColumnPrefs()).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("returns saved, valid ids from a prior saveColumnPrefs call", () => {
    saveColumnPrefs(["name", "studentId", "feeStatus"]);
    expect(loadColumnPrefs()).toEqual(["name", "studentId", "feeStatus"]);
  });

  it("filters out unknown/invented column ids, keeping only the real ones", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["name", "notARealColumn", "studentId"]));
    expect(loadColumnPrefs()).toEqual(["name", "studentId"]);
  });

  it("falls back to the default set when every stored id is invalid", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["bogus1", "bogus2"]));
    expect(loadColumnPrefs()).toEqual(DEFAULT_VISIBLE_COLUMNS);
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
    saveColumnPrefs(["photo", "name"]);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(["photo", "name"]);
  });

  it("round-trips reset-to-default through save then load", () => {
    saveColumnPrefs(["name"]);
    saveColumnPrefs(DEFAULT_VISIBLE_COLUMNS);
    expect(loadColumnPrefs()).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });
});
