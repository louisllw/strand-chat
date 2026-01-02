import { renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useAuth } from "./useAuth";

it("throws when used outside AuthProvider", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => renderHook(() => useAuth())).toThrow(
    "useAuth must be used within an AuthProvider"
  );
  consoleError.mockRestore();
});
