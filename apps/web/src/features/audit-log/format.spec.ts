import { describe, it, expect } from "vitest";
import { formatAuditDateTime, formatAuditDateTimeSeconds, formatActionLabel, diffChanges } from "./format";

describe("formatAuditDateTime / formatAuditDateTimeSeconds", () => {
  it("formats as 'DD Mon YYYY, hh:mm AM/PM'", () => {
    const result = formatAuditDateTime("2028-09-03T15:42:00.000Z");
    expect(result).toMatch(/^\d{2} \w+\.? \d{4}, \d{2}:\d{2} (AM|PM)$/);
  });

  it("the seconds variant includes seconds in the time portion", () => {
    const result = formatAuditDateTimeSeconds("2028-09-03T15:42:07.000Z");
    expect(result).toMatch(/^\d{2} \w+\.? \d{4}, \d{2}:\d{2}:\d{2} (AM|PM)$/);
  });
});

describe("formatActionLabel", () => {
  it("converts an ALL_CAPS_SNAKE_CASE action into a capitalized sentence fragment", () => {
    expect(formatActionLabel("STUDENT_CREATED")).toBe("Student created");
    expect(formatActionLabel("TEACHER_LOGIN_INVITED")).toBe("Teacher login invited");
  });

  it("leaves a legacy non-matching action string untouched", () => {
    expect(formatActionLabel("school.create")).toBe("school.create");
  });

  it("leaves a lowercase or mixed-case action untouched", () => {
    expect(formatActionLabel("someAction")).toBe("someAction");
  });
});

describe("diffChanges", () => {
  it("only includes keys whose value actually differs", () => {
    const rows = diffChanges({ name: "A", age: 10 }, { name: "A", age: 11 });
    expect(rows).toEqual([{ field: "age", before: "10", after: "11" }]);
  });

  it("shows every 'after' key as '— -> value' for a CREATE (before is null)", () => {
    const rows = diffChanges(null, { name: "New Subject" });
    expect(rows).toEqual([{ field: "name", before: "—", after: "New Subject" }]);
  });

  it("shows every 'before' key as 'value -> —' for a DELETE (after is null)", () => {
    const rows = diffChanges({ name: "Old Subject" }, null);
    expect(rows).toEqual([{ field: "name", before: "Old Subject", after: "—" }]);
  });

  it("treats deep-equal object/array values as unchanged (compares by JSON, not reference)", () => {
    const rows = diffChanges({ tags: ["a", "b"] }, { tags: ["a", "b"] });
    expect(rows).toEqual([]);
  });

  it("JSON-stringifies a changed object/array value rather than showing '[object Object]'", () => {
    const rows = diffChanges({ tags: ["a"] }, { tags: ["a", "b"] });
    expect(rows).toEqual([{ field: "tags", before: '["a"]', after: '["a","b"]' }]);
  });

  it("returns no rows for two identical objects", () => {
    expect(diffChanges({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
