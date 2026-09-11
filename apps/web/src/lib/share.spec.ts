import { describe, it, expect, vi, afterEach } from "vitest";
import { shareText, formatStudentListForShare } from "./share";

function stubNavigatorShare(impl: ((data: ShareData) => Promise<void>) | undefined) {
  Object.defineProperty(navigator, "share", { value: impl, configurable: true, writable: true });
}

function stubClipboard(impl: { writeText: (text: string) => Promise<void> }) {
  Object.defineProperty(navigator, "clipboard", { value: impl, configurable: true, writable: true });
}

describe("shareText", () => {
  afterEach(() => {
    stubNavigatorShare(undefined);
  });

  it("uses the Web Share API and returns 'shared' when navigator.share succeeds", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigatorShare(share);

    const result = await shareText("Title", "Body text");

    expect(share).toHaveBeenCalledWith({ title: "Title", text: "Body text" });
    expect(result).toBe("shared");
  });

  it("falls back to the clipboard when navigator.share is unavailable", async () => {
    stubNavigatorShare(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    const result = await shareText("Title", "Body text");

    expect(writeText).toHaveBeenCalledWith("Body text");
    expect(result).toBe("copied");
  });

  it("falls back to the clipboard, not 'failed', when the user cancels the native share sheet", async () => {
    stubNavigatorShare(vi.fn().mockRejectedValue(new Error("AbortError")));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText });

    const result = await shareText("Title", "Body text");

    expect(result).toBe("copied");
  });

  it("returns 'failed' when both share and clipboard are unavailable/reject", async () => {
    stubNavigatorShare(undefined);
    stubClipboard({ writeText: vi.fn().mockRejectedValue(new Error("denied")) });

    const result = await shareText("Title", "Body text");

    expect(result).toBe("failed");
  });
});

describe("formatStudentListForShare", () => {
  it("pluralizes the student count correctly for 0/1/many", () => {
    expect(formatStudentListForShare("Roster", [])).toContain("0 students");
    expect(
      formatStudentListForShare("Roster", [{ firstName: "A", lastName: "One", studentNumber: "S1", rollNumber: 1 }]),
    ).toContain("1 student\n");
  });

  it("includes class/section in parentheses only when at least one is present", () => {
    const withPlace = formatStudentListForShare("Roster", [
      { firstName: "A", lastName: "One", studentNumber: "S1", rollNumber: 1, className: "Class 3", sectionName: "B" },
    ]);
    expect(withPlace).toContain("(Class 3 - Section B)");

    const withoutPlace = formatStudentListForShare("Roster", [
      { firstName: "A", lastName: "One", studentNumber: "S1", rollNumber: 1 },
    ]);
    expect(withoutPlace).not.toContain("(");
  });

  it("numbers each student line sequentially starting at 1", () => {
    const result = formatStudentListForShare("Roster", [
      { firstName: "A", lastName: "One", studentNumber: "S1", rollNumber: 1 },
      { firstName: "B", lastName: "Two", studentNumber: "S2", rollNumber: 2 },
    ]);
    expect(result).toContain("1. A One — Roll 1, ID S1");
    expect(result).toContain("2. B Two — Roll 2, ID S2");
  });
});
