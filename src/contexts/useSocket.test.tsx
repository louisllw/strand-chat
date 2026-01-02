import { renderHook } from "@testing-library/react";
import { vi } from "vitest";
import { useSocket } from "./useSocket";

it("throws when used outside SocketProvider", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => renderHook(() => useSocket())).toThrow(
    "useSocket must be used within a SocketProvider"
  );
  consoleError.mockRestore();
});
