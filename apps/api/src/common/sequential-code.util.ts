import { Prisma } from "@school-erp/database";

// Generates a padded, prefixed sequential code (e.g. "TCH-00042") from a
// fresh count and retries the whole creation attempt — not just the code —
// when (and only when) that exact code collided under concurrent creation.
// A plain count()+1 read-then-insert has a real race: two School Admins
// creating a person at the same instant can read the same count before
// either commits. Retrying is safe here because `attempt` is expected to be
// the entire creation transaction, so a failed try leaves nothing behind to
// clean up — the next attempt starts from a fresh, fully-committed count.
//
// Any other P2002 (e.g. a duplicate per-school employeeNumber/staffNumber,
// which is a real, permanent conflict the caller must still surface as its
// own error) is rethrown immediately on the first attempt, never retried —
// distinguished via Prisma's own `error.meta.target`, which names the
// column(s) the violated constraint actually covers.
export async function createWithSequentialCode<T>(
  countCurrent: () => Promise<number>,
  prefix: string,
  codeField: string,
  attempt: (code: string) => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const count = await countCurrent();
    const code = `${prefix}-${String(count + 1).padStart(5, "0")}`;
    try {
      return await attempt(code);
    } catch (error) {
      const isCodeCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (error.meta?.target as string[] | undefined)?.includes(codeField);
      if (!isCodeCollision || i === maxAttempts - 1) throw error;
    }
  }
  // Unreachable — the loop above always either returns or throws by its
  // last iteration. Only here to satisfy TypeScript's control-flow analysis.
  throw new Error("unreachable");
}

// The highest sequence number already used among `codes` for `prefix`
// (e.g. "EMP-00007" and "EMP-0003" with prefix "EMP" -> 7), or 0 when there
// are none. New codes must be based on THIS, never on a row count: deleting a
// row makes count() drop below the highest code still in use, so count + 1
// collides with an existing code — permanently, since the count never moves.
export function highestSequenceOf(codes: Array<string | null | undefined>, prefix: string): number {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let highest = 0;
  for (const code of codes) {
    const match = code ? pattern.exec(code) : null;
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}
