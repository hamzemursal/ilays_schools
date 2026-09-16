import { Prisma } from "@school-erp/database";
import { createWithSequentialCode } from "./sequential-code.util";

function collision(field: string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: [field] },
  });
}

function genericError() {
  return new Error("Something else entirely");
}

describe("createWithSequentialCode", () => {
  it("generates the first code from a count of 0, padded to 5 digits", async () => {
    const countCurrent = jest.fn().mockResolvedValue(0);
    const attempt = jest.fn().mockResolvedValue("created");

    const result = await createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt);

    expect(attempt).toHaveBeenCalledWith("TCH-00001");
    expect(result).toBe("created");
  });

  it("uses count+1 for the code, not the raw count", async () => {
    const countCurrent = jest.fn().mockResolvedValue(41);
    const attempt = jest.fn().mockResolvedValue("created");

    await createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt);

    expect(attempt).toHaveBeenCalledWith("TCH-00042");
  });

  it("never calls countCurrent or attempt again once the first attempt succeeds", async () => {
    const countCurrent = jest.fn().mockResolvedValue(0);
    const attempt = jest.fn().mockResolvedValue("created");

    await createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt);

    expect(countCurrent).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("retries with a freshly recomputed count when the code itself collided (a genuine race)", async () => {
    const countCurrent = jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(6);
    const attempt = jest.fn().mockRejectedValueOnce(collision("teacherCode")).mockResolvedValueOnce("created");

    const result = await createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt);

    expect(attempt).toHaveBeenNthCalledWith(1, "TCH-00006");
    expect(attempt).toHaveBeenNthCalledWith(2, "TCH-00007");
    expect(result).toBe("created");
  });

  it("gives up after maxAttempts consecutive code collisions and rethrows the last error", async () => {
    const countCurrent = jest.fn().mockResolvedValue(0);
    const error = collision("teacherCode");
    const attempt = jest.fn().mockRejectedValue(error);

    await expect(createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt, 3)).rejects.toThrow(error);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("does not retry a P2002 on a different constraint (e.g. a real duplicate employeeNumber) — rethrows immediately", async () => {
    const countCurrent = jest.fn().mockResolvedValue(0);
    const error = collision("employeeNumber");
    const attempt = jest.fn().mockRejectedValue(error);

    await expect(createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt)).rejects.toThrow(error);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("does not retry a P2002 with no meta.target at all — rethrows immediately", async () => {
    const countCurrent = jest.fn().mockResolvedValue(0);
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    const attempt = jest.fn().mockRejectedValue(error);

    await expect(createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt)).rejects.toThrow(error);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it("does not retry a non-Prisma error — rethrows immediately", async () => {
    const countCurrent = jest.fn().mockResolvedValue(0);
    const error = genericError();
    const attempt = jest.fn().mockRejectedValue(error);

    await expect(createWithSequentialCode(countCurrent, "TCH", "teacherCode", attempt)).rejects.toThrow(error);
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
