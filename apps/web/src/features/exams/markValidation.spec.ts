import { describe, it, expect } from "vitest";
import { markError } from "./markValidation";

describe("markError: 0 <= mark <= maximum, at most 2 decimals", () => {
  it("accepts a blank (Missing), 0, the maximum, and in-range decimals", () => {
    for (const v of ["", "  ", "0", "50", "49.5", "12.25"]) expect(markError(v, 50)).toBeNull();
  });

  it("rejects negatives, anything above the maximum, non-numbers and long decimals", () => {
    expect(markError("-1", 50)).toBe("A mark can't be negative");
    expect(markError("50.01", 50)).toBe("Above the maximum of 50");
    expect(markError("51", 50)).toBe("Above the maximum of 50");
    expect(markError("abc", 50)).toBe("Enter a number");
    expect(markError("12.345", 50)).toBe("Use at most 2 decimal places");
  });

  it("uses the Admin's maximum, whatever it is", () => {
    expect(markError("100", 100)).toBeNull();
    expect(markError("101", 100)).toBe("Above the maximum of 100");
    expect(markError("31", 30)).toBe("Above the maximum of 30");
  });
});
