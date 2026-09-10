import { Prisma } from "@school-erp/database";
import { sanitizeForAudit } from "./sanitize.util";

describe("sanitizeForAudit", () => {
  it("converts a Date to its ISO string instead of flattening it to {}", () => {
    const date = new Date("2027-07-01T00:00:00.000Z");

    expect(sanitizeForAudit({ effectiveFrom: date })).toEqual({ effectiveFrom: "2027-07-01T00:00:00.000Z" });
  });

  it("converts a Prisma.Decimal to a plain number instead of crashing on its internal shape", () => {
    const amount = new Prisma.Decimal("330.00");

    expect(sanitizeForAudit({ netSalary: amount })).toEqual({ netSalary: 330 });
  });

  it("still redacts sensitive keys alongside a Date/Decimal in the same object", () => {
    const result = sanitizeForAudit({
      effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      basicSalary: new Prisma.Decimal("300"),
      password: "hunter2",
    });

    expect(result).toEqual({
      effectiveFrom: "2027-01-01T00:00:00.000Z",
      basicSalary: 300,
      password: "[REDACTED]",
    });
  });

  it("still passes plain values through unchanged", () => {
    expect(sanitizeForAudit({ amount: 25, method: "CASH", note: null })).toEqual({
      amount: 25,
      method: "CASH",
      note: null,
    });
  });
});
