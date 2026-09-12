import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "@/components/ui/Toast";
import { PhotoUpload } from "./PhotoUpload";

const { ApiError } = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError };
});
vi.mock("@/lib/auth-context", () => ({ ApiError }));

const apiMock = vi.hoisted(() => ({ uploadStudentPhoto: vi.fn(), getStudentPhotoUrl: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

function renderUpload(overrides: Partial<React.ComponentProps<typeof PhotoUpload>> = {}) {
  return render(
    <ToastProvider>
      <PhotoUpload accessToken="token-1" studentId="stu-1" name="Hodan Ali" canUpload={true} photoUrl={null} {...overrides} />
    </ToastProvider>,
  );
}

function file(name = "photo.png") {
  return new File(["fake image bytes"], name, { type: "image/png" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PhotoUpload — visibility", () => {
  it("shows no upload control when canUpload is false", () => {
    renderUpload({ canUpload: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("labels the button 'Upload photo' when there's no existing photo", () => {
    renderUpload({ photoUrl: null });
    expect(screen.getByRole("button", { name: "Upload photo" })).toBeInTheDocument();
  });

  it("labels the button 'Replace photo' when a photo already exists", () => {
    renderUpload({ photoUrl: "https://cdn.example/hodan.jpg" });
    expect(screen.getByRole("button", { name: "Replace photo" })).toBeInTheDocument();
  });
});

describe("PhotoUpload — upload flow", () => {
  it("opens the file picker when the button is clicked", async () => {
    const user = userEvent.setup();
    renderUpload();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Upload photo" }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it("uploads the selected file, refetches the photo URL, and notifies the caller", async () => {
    const user = userEvent.setup();
    apiMock.uploadStudentPhoto.mockResolvedValue(undefined);
    apiMock.getStudentPhotoUrl.mockResolvedValue({ url: "https://cdn.example/new.jpg" });
    const onUploaded = vi.fn();
    renderUpload({ onUploaded });

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file());

    expect(apiMock.uploadStudentPhoto).toHaveBeenCalledWith("token-1", "stu-1", expect.any(File));
    expect(await screen.findByText("Photo uploaded.")).toBeInTheDocument();
    expect(onUploaded).toHaveBeenCalledWith("https://cdn.example/new.jpg");
  });

  it("shows the ApiError's own message when the upload fails", async () => {
    const user = userEvent.setup();
    apiMock.uploadStudentPhoto.mockRejectedValue(new ApiError("File too large"));
    renderUpload();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file());

    expect(await screen.findByText("File too large")).toBeInTheDocument();
  });

  it("shows a generic failure message for a non-ApiError upload failure", async () => {
    const user = userEvent.setup();
    apiMock.uploadStudentPhoto.mockRejectedValue(new Error("network down"));
    renderUpload();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file());

    expect(await screen.findByText("Upload failed")).toBeInTheDocument();
  });

  it("disables the button while the upload is in progress", async () => {
    const user = userEvent.setup();
    let resolveUpload!: () => void;
    apiMock.uploadStudentPhoto.mockReturnValue(new Promise<void>((r) => (resolveUpload = r)));
    apiMock.getStudentPhotoUrl.mockResolvedValue({ url: null });
    renderUpload();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file());

    expect(screen.getByRole("button", { name: "Upload photo" })).toBeDisabled();
    resolveUpload();
  });
});
