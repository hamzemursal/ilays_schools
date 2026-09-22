import { BadRequestException } from "@nestjs/common";
import { assertClassInYear, assertClassStamped, classYearReadWhere, resolveSchoolYear } from "./class-year";

// The one place that says how the backend treats a class's academic year.
describe("resolveSchoolYear", () => {
  const db = () => ({ academicYear: { findFirst: jest.fn() } });

  it("an explicit id must belong to the school", async () => {
    const d = db();
    d.academicYear.findFirst.mockResolvedValue({ id: "year-26" });

    await expect(resolveSchoolYear(d, "school-1", "year-26")).resolves.toEqual({ id: "year-26" });
    expect(d.academicYear.findFirst).toHaveBeenCalledWith({ where: { id: "year-26", schoolId: "school-1" } });
  });

  it("an explicit id from another school is refused", async () => {
    const d = db();
    d.academicYear.findFirst.mockResolvedValue(null);

    await expect(resolveSchoolYear(d, "school-1", "foreign")).rejects.toThrow(BadRequestException);
    await expect(resolveSchoolYear(d, "school-1", "foreign")).rejects.toThrow("That academic year does not belong to this school");
  });

  it("no id: the CURRENT academic year", async () => {
    const d = db();
    d.academicYear.findFirst.mockResolvedValueOnce({ id: "current" });

    await expect(resolveSchoolYear(d, "school-1")).resolves.toEqual({ id: "current" });
    expect(d.academicYear.findFirst).toHaveBeenCalledTimes(1);
    expect(d.academicYear.findFirst).toHaveBeenCalledWith({ where: { schoolId: "school-1", isCurrent: true } });
  });

  it("no id and no current year: the LATEST year by start date", async () => {
    const d = db();
    d.academicYear.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "latest" });

    await expect(resolveSchoolYear(d, "school-1", null)).resolves.toEqual({ id: "latest" });
    expect(d.academicYear.findFirst).toHaveBeenLastCalledWith({ where: { schoolId: "school-1" }, orderBy: { startDate: "desc" } });
  });

  it("a school with no academic year at all resolves to null", async () => {
    const d = db();
    d.academicYear.findFirst.mockResolvedValue(null);

    await expect(resolveSchoolYear(d, "school-1")).resolves.toBeNull();
  });
});

describe("classYearReadWhere", () => {
  it("matches the year's classes and still-unstamped legacy classes, never another year's", () => {
    expect(classYearReadWhere("year-26")).toEqual({ OR: [{ academicYearId: "year-26" }, { academicYearId: null }] });
  });
});

describe("assertClassInYear / assertClassStamped", () => {
  it("passes for a class of exactly that year", () => {
    expect(() => assertClassInYear({ name: "Form 3", academicYearId: "year-26" }, "year-26")).not.toThrow();
  });

  it("refuses a class of another year, naming the class and the selected year", () => {
    expect(() => assertClassInYear({ name: "Form 3", academicYearId: "year-25" }, "year-26", "2026-2027")).toThrow(
      "Form 3 belongs to a different academic year than the selected one (2026-2027). Choose the Form 3 of that year.",
    );
  });

  it("refuses an unstamped legacy class with a clear message pointing at the backfill", () => {
    expect(() => assertClassInYear({ name: "Form 3", academicYearId: null }, "year-26")).toThrow(
      /Form 3 has no academic year yet\. Run the class year backfill/,
    );
    expect(() => assertClassStamped({ name: "Form 3", academicYearId: null })).toThrow(BadRequestException);
  });

  it("assertClassStamped accepts any stamped class", () => {
    expect(() => assertClassStamped({ name: "Form 3", academicYearId: "year-25" })).not.toThrow();
  });
});
