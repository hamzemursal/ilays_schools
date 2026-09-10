// Cloudinary itself is mocked — these tests verify StorageService calls it
// with the right options (especially `type: "private"`), not that
// Cloudinary's own signing logic works, which is Cloudinary's job to test.
const uploadStreamMock = jest.fn((_options: unknown, callback: (error: unknown, result: unknown) => void) => ({
  end: () => callback(null, {}),
}));
const urlMock = jest.fn(() => "https://res.cloudinary.com/demo/public-url");
const privateDownloadUrlMock = jest.fn(
  (_publicId: string, _format: string, _options: Record<string, unknown>) =>
    "https://res.cloudinary.com/demo/private-url?signature=abc",
);

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: { upload_stream: uploadStreamMock, destroy: jest.fn() },
    url: urlMock,
    utils: { private_download_url: privateDownloadUrlMock },
  },
}));

import { StorageService } from "./storage.service";

describe("StorageService — private (exam paper) storage", () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StorageService();
  });

  it("uploadPrivate() uploads with type: private, not the default public upload", async () => {
    await service.uploadPrivate("result-submissions/sub-1/file.pdf", Buffer.from("x"), "application/pdf");

    expect(uploadStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "private", resource_type: "raw", public_id: "result-submissions/sub-1/file" }),
      expect.any(Function),
    );
  });

  it("getPrivateDownloadUrl() asks Cloudinary for a private_download_url with type: private and a near-term expiry", async () => {
    const before = Math.floor(Date.now() / 1000);
    const url = await service.getPrivateDownloadUrl("result-submissions/sub-1/file.pdf", "application/pdf", 600);
    const after = Math.floor(Date.now() / 1000);

    expect(url).toBe("https://res.cloudinary.com/demo/private-url?signature=abc");
    expect(privateDownloadUrlMock).toHaveBeenCalledTimes(1);
    const [publicId, format, options] = privateDownloadUrlMock.mock.calls[0];
    expect(publicId).toBe("result-submissions/sub-1/file");
    expect(format).toBe("pdf");
    expect(options).toMatchObject({ type: "private", resource_type: "raw" });
    // expires_at must be roughly "now + 600s", not a stale or far-future value.
    const expiresAt = options.expires_at as number;
    expect(expiresAt).toBeGreaterThanOrEqual(before + 600);
    expect(expiresAt).toBeLessThanOrEqual(after + 600);
  });

  it("the existing public upload()/getSignedDownloadUrl() are untouched — no type: private leaks into them", async () => {
    await service.upload("students/s1/photo.jpg", Buffer.from("x"), "image/jpeg");
    expect(uploadStreamMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ type: "private" }),
      expect.any(Function),
    );

    await service.getSignedDownloadUrl("students/s1/photo.jpg", "image/jpeg");
    expect(urlMock).toHaveBeenCalledWith("students/s1/photo", expect.not.objectContaining({ type: "private" }));
  });
});
