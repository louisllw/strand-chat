import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const setupToast = async () => {
  vi.resetModules();
  return import("./use-toast");
};

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it("adds and limits to a single toast", async () => {
    const { useToast } = await setupToast();
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: "First" });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.title).toBe("First");

    act(() => {
      result.current.toast({ title: "Second" });
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]?.title).toBe("Second");
  });

  it("updates and dismisses a toast", async () => {
    const { useToast } = await setupToast();
    const { result } = renderHook(() => useToast());

    let dismiss: (() => void) | undefined;
    let update: ((props: { title?: string }) => void) | undefined;

    act(() => {
      const actions = result.current.toast({ title: "Original" });
      dismiss = actions.dismiss;
      update = actions.update;
    });

    act(() => {
      update?.({ title: "Updated" });
    });
    expect(result.current.toasts[0]?.title).toBe("Updated");

    act(() => {
      dismiss?.();
    });
    expect(result.current.toasts[0]?.open).toBe(false);

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.toasts).toHaveLength(0);
  });

  it("dismisses all toasts when no id is provided", async () => {
    const { useToast } = await setupToast();
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.toast({ title: "One" });
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.toasts[0]?.open).toBe(false);

    act(() => {
      vi.runAllTimers();
    });
    expect(result.current.toasts).toHaveLength(0);
  });
});
