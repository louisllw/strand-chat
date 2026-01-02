import { describe, it, expect } from "vitest";
import { getSocketUrl } from "./api";

const setLocation = (url: string) => {
  Object.defineProperty(window, "location", {
    value: new URL(url),
    writable: true,
  });
};

describe("getSocketUrl", () => {
  it("uses port 3001 when the app runs on another port", () => {
    setLocation("http://localhost:8080");
    expect(getSocketUrl()).toBe("http://localhost:3001");
  });

  it("uses the current origin when already on port 3001", () => {
    setLocation("http://localhost:3001");
    expect(getSocketUrl()).toBe("http://localhost:3001");
  });
});
