import { describe, it, expect, vi } from "vitest";
import LegacyLifecycleAlumniPage from "./page";
import LegacySchoolLifecycleAlumniPage from "../../schools/[id]/student-lifecycle/alumni/page";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));

describe("old Student Lifecycle → Alumni pages", () => {
  it("send org-wide visitors to the Alumni Directory", () => {
    LegacyLifecycleAlumniPage();
    expect(redirect).toHaveBeenCalledWith("/alumni");
  });

  it("send a school's visitors to that school's Alumni Directory", async () => {
    await LegacySchoolLifecycleAlumniPage({ params: Promise.resolve({ id: "school-1" }) });
    expect(redirect).toHaveBeenCalledWith("/schools/school-1/alumni");
  });
});
