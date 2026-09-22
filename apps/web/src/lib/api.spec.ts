import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, ApiError, setUnauthorizedHandler } from "./api";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("api transport (request/downloadFile/uploadFile via api.* methods)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it("attaches an Authorization header only when an access token is given", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: "u1" }));

    await api.me("token-123");

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-123");
  });

  it("throws ApiError with the server's message and status on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: "Invalid credentials" }));

    await expect(api.login("a@example.com", "wrong")).rejects.toMatchObject({
      message: "Invalid credentials",
      status: 400,
    });
  });

  it("joins an array-shaped validation message into a single comma-separated string", async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: ["name must not be empty", "email must be valid"] }));

    await expect(api.login("a@example.com", "wrong")).rejects.toThrow(
      "name must not be empty, email must be valid",
    );
  });

  it("falls back to a generic 'Request failed with status N' message when the body has none", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, null));
    await expect(api.login("a@example.com", "x")).rejects.toThrow("Request failed with status 500");
  });

  it("retries once with a fresh token on 401 when an unauthorized handler is registered", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: "Invalid or expired access token" }))
      .mockResolvedValueOnce(jsonResponse(200, { id: "u1" }));
    setUnauthorizedHandler(vi.fn().mockResolvedValue("fresh-token"));

    await api.me("stale-token");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallHeaders = fetchMock.mock.calls[1][1].headers as Record<string, string>;
    expect(secondCallHeaders.Authorization).toBe("Bearer fresh-token");
  });

  it("does not retry (and throws) when the unauthorized handler can't get a fresh token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "Invalid or expired access token" }));
    setUnauthorizedHandler(vi.fn().mockResolvedValue(null));

    await expect(api.me("stale-token")).rejects.toThrow("Invalid or expired access token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never attempts a 401 retry when no access token was used for the original call", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "unauthorized" }));
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    // login() calls request() without an accessToken — the 401-retry path is
    // gated on options.accessToken being truthy, so a failed login must never
    // trigger a refresh attempt.
    await expect(api.login("a@example.com", "wrong")).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it("builds query params from only the defined entries (qs helper, exercised via a filtered list call)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await api.listStudents("token", "school-1", { search: "ali" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("search=ali");
  });
});

// Classes belong to one academic year: the class calls carry it.
describe("api — academic-year scoped classes", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastUrl = () => String(fetchMock.mock.calls[0][0]);

  it("createClass sends the academic year in the body", async () => {
    await api.createClass("t", "school-1", { divisionId: "d1", academicYearId: "y26", name: "Form 3", level: 3 });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toMatchObject({ divisionId: "d1", academicYearId: "y26", name: "Form 3", level: 3 });
  });

  it("resolveClass adds the academic year only when one is given", async () => {
    await api.resolveClass("t", "school-1", "secondary-3", "y26");
    expect(lastUrl()).toContain("/schools/school-1/classes/by-identifier/secondary-3?academicYearId=y26");

    fetchMock.mockClear();
    await api.resolveClass("t", "school-1", "secondary-3");
    expect(lastUrl()).toMatch(/by-identifier\/secondary-3$/);
  });

  it("previewPromotion adds the destination year only when one is given", async () => {
    await api.previewPromotion("t", "school-1", "sec-1", "y25", "y26");
    expect(lastUrl()).toContain("promotion/preview?fromAcademicYearId=y25&toAcademicYearId=y26");

    fetchMock.mockClear();
    await api.previewPromotion("t", "school-1", "sec-1", "y25");
    expect(lastUrl()).toMatch(/promotion\/preview\?fromAcademicYearId=y25$/);
  });

  it("listClasses passes the year filter", async () => {
    await api.listClasses("t", "school-1", "y26");
    expect(lastUrl()).toContain("/schools/school-1/classes?academicYearId=y26");
  });
});
