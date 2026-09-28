import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import SchoolSegmentLayout from "./layout";

const replace = vi.hoisted(() => vi.fn());
const pathname = vi.hoisted(() => ({ value: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => pathname.value,
  useSearchParams: () => new URLSearchParams("year=2028-2029"),
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ accessToken: "token" }), ApiError: Error }));
const apiMock = vi.hoisted(() => ({ resolveSchool: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

const SCHOOL_ID = "df1db6d3-96e4-4598-934a-cea74aecca10";

async function renderLayout(id: string) {
  const params = Promise.resolve({ id });
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <SchoolSegmentLayout params={params}>
          <p>page content</p>
        </SchoolSegmentLayout>
      </Suspense>,
    );
  });
}

beforeEach(() => vi.clearAllMocks());

describe("/schools/[id] — school slug in the URL", () => {
  it("renders the page directly for a real school id", async () => {
    pathname.value = `/schools/${SCHOOL_ID}/student-lifecycle`;
    await renderLayout(SCHOOL_ID);
    expect(await screen.findByText("page content")).toBeInTheDocument();
    expect(apiMock.resolveSchool).not.toHaveBeenCalled();
  });

  it("resolves a slug and replaces it with the real id, keeping the rest of the path and the query", async () => {
    apiMock.resolveSchool.mockResolvedValue({ id: SCHOOL_ID, name: "SYL schools" });
    pathname.value = "/schools/syl-schools/academic/classes/secondary-3/sections/a-b";
    await renderLayout("syl-schools");

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(`/schools/${SCHOOL_ID}/academic/classes/secondary-3/sections/a-b?year=2028-2029`),
    );
    expect(apiMock.resolveSchool).toHaveBeenCalledWith("token", "syl-schools");
    // The page never runs with the slug as if it were an id.
    expect(screen.queryByText("page content")).toBeNull();
  });

  it("shows the error when the slug is not a school the user can access", async () => {
    apiMock.resolveSchool.mockRejectedValue(new Error("School not found"));
    pathname.value = "/schools/unknown/dashboard";
    await renderLayout("unknown");
    expect(await screen.findByText("School not found")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
