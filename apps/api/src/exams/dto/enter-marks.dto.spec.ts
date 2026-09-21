import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { EnterMarksDto } from "./enter-marks.dto";

const ID = "3f1c2a4e-1d1b-4d2e-9a53-0a6f1e7a9c11";

async function errorsFor(entry: Record<string, unknown>) {
  return validate(plainToInstance(EnterMarksDto, { entries: [entry] }));
}

describe("EnterMarksDto — a mark or an explicit absence, never an implied 0", () => {
  it("accepts a numeric mark, including a genuine 0", async () => {
    expect(await errorsFor({ enrollmentId: ID, marksObtained: 72.5 })).toHaveLength(0);
    expect(await errorsFor({ enrollmentId: ID, marksObtained: 0 })).toHaveLength(0);
  });

  it("accepts an absent entry with no mark at all", async () => {
    expect(await errorsFor({ enrollmentId: ID, isAbsent: true })).toHaveLength(0);
  });

  it("rejects an entry with neither a mark nor an absence", async () => {
    expect(await errorsFor({ enrollmentId: ID })).not.toHaveLength(0);
  });

  it("rejects a negative or non-numeric mark", async () => {
    expect(await errorsFor({ enrollmentId: ID, marksObtained: -1 })).not.toHaveLength(0);
    expect(await errorsFor({ enrollmentId: ID, marksObtained: "seventy" })).not.toHaveLength(0);
  });

  it("isAbsent: false still requires a real mark", async () => {
    expect(await errorsFor({ enrollmentId: ID, isAbsent: false })).not.toHaveLength(0);
    expect(await errorsFor({ enrollmentId: ID, isAbsent: false, marksObtained: 50 })).toHaveLength(0);
  });
});
