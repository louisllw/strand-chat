import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const setLocation = (url: string) => {
  Object.defineProperty(window, "location", {
    value: new URL(url),
    writable: true,
  });
};

const setupApi = async () => {
  vi.resetModules();
  return import("./api");
};

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds CSRF token for unsafe methods", async () => {
    const fetchMock = vi.fn((url: RequestInfo, options?: RequestInit) => {
      if (String(url).endsWith("/api/auth/csrf")) {
        return Promise.resolve(
          new Response(JSON.stringify({ csrfToken: "token-1" }), { status: 200 })
        );
      }
      const headers = new Headers(options?.headers);
      expect(headers.get("x-csrf-token")).toBe("token-1");
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await setupApi();
    await apiFetch("/api/conversations", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries safe methods for retryable statuses", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("fail", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await setupApi();
    const promise = apiFetch("/api/conversations");
    await vi.runAllTimersAsync();
    const data = await promise;
    expect(data).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("dispatches unauthorized event for non-auth endpoints", async () => {
    const fetchMock = vi.fn((url: RequestInfo) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith("/api/auth/csrf")) {
        return Promise.resolve(
          new Response(JSON.stringify({ csrfToken: "token-1" }), { status: 200 })
        );
      }
      if (requestUrl.endsWith("/api/auth/refresh")) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch, AUTH_UNAUTHORIZED_EVENT } = await setupApi();

    const handler = vi.fn();
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handler);

    await expect(apiFetch("/api/messages")).rejects.toBeInstanceOf(Error);
    expect(handler.mock.calls.length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
  });

  it("does not dispatch unauthorized event for auth endpoints", async () => {
    const fetchMock = vi.fn((url: RequestInfo) => {
      const requestUrl = String(url);
      if (requestUrl.endsWith("/api/auth/csrf")) {
        return Promise.resolve(
          new Response(JSON.stringify({ csrfToken: "token-1" }), { status: 200 })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch, AUTH_UNAUTHORIZED_EVENT } = await setupApi();

    const handler = vi.fn();
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handler);

    await expect(apiFetch("/api/auth/login", { method: "POST" })).rejects.toBeInstanceOf(Error);
    expect(handler).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handler);
  });

  it("returns text payloads when response is not JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("plain", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { apiFetch } = await setupApi();

    const data = await apiFetch<string>("/api/health");
    expect(data).toBe("plain");
  });
});

describe("getSocketUrl", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("uses port 3001 when the app runs on another port", async () => {
    setLocation("http://localhost:8080");
    const { getSocketUrl } = await setupApi();
    expect(getSocketUrl()).toBe("http://localhost:3001");
  });

  it("uses the current origin when already on port 3001", async () => {
    setLocation("http://localhost:3001");
    const { getSocketUrl } = await setupApi();
    expect(getSocketUrl()).toBe("http://localhost:3001");
  });
});
