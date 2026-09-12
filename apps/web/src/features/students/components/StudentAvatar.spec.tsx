import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StudentAvatar } from "./StudentAvatar";

const apiMock = vi.hoisted(() => ({ getStudentPhotoUrl: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StudentAvatar", () => {
  it("shows initials while the photo URL is still loading", () => {
    apiMock.getStudentPhotoUrl.mockReturnValue(new Promise(() => {}));
    render(<StudentAvatar accessToken="token-1" studentId="stu-1" name="Hodan Ali" />);
    expect(screen.getByText("HA")).toBeInTheDocument();
  });

  it("fetches the photo scoped to the given student and access token", () => {
    apiMock.getStudentPhotoUrl.mockReturnValue(new Promise(() => {}));
    render(<StudentAvatar accessToken="token-1" studentId="stu-1" name="Hodan Ali" />);
    expect(apiMock.getStudentPhotoUrl).toHaveBeenCalledWith("token-1", "stu-1");
  });

  it("renders the real photo once it resolves", async () => {
    apiMock.getStudentPhotoUrl.mockResolvedValue({ url: "https://cdn.example/hodan.jpg" });
    const { container } = render(<StudentAvatar accessToken="token-1" studentId="stu-1" name="Hodan Ali" />);
    // alt="" is deliberate (decorative image) — it removes the "img" role
    // from the accessibility tree, so this has to query the DOM directly.
    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());
    expect(container.querySelector("img")).toHaveAttribute("src", "https://cdn.example/hodan.jpg");
  });

  it("falls back to initials, without crashing, when the fetch fails", async () => {
    apiMock.getStudentPhotoUrl.mockRejectedValue(new Error("network down"));
    render(<StudentAvatar accessToken="token-1" studentId="stu-1" name="Hodan Ali" />);
    await waitFor(() => expect(apiMock.getStudentPhotoUrl).toHaveBeenCalled());
    expect(screen.getByText("HA")).toBeInTheDocument();
  });
});
