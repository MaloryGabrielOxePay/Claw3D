import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOnboardingState } from "@/features/onboarding/useOnboardingState";

describe("useOnboardingState", () => {
  afterEach(() => {
    // Clean up localStorage between tests
    try {
      window.localStorage.removeItem("claw3d:onboarding:completed");
    } catch {
      // noop
    }
  });

  it("shows onboarding by default when localStorage is empty", () => {
    const { result } = renderHook(() => useOnboardingState());
    expect(result.current.showOnboarding).toBe(true);
  });

  it("hides onboarding after completeOnboarding is called", () => {
    const { result } = renderHook(() => useOnboardingState());
    expect(result.current.showOnboarding).toBe(true);

    act(() => {
      result.current.completeOnboarding();
    });

    expect(result.current.showOnboarding).toBe(false);
  });

  it("persists completion to localStorage", () => {
    const { result } = renderHook(() => useOnboardingState());

    act(() => {
      result.current.completeOnboarding();
    });

    expect(window.localStorage.getItem("claw3d:onboarding:completed")).toBe(
      "true",
    );
  });

  it("reads completion state from localStorage on mount", () => {
    window.localStorage.setItem("claw3d:onboarding:completed", "true");
    const { result } = renderHook(() => useOnboardingState());
    expect(result.current.showOnboarding).toBe(false);
  });

  it("resets onboarding when resetOnboarding is called", () => {
    const { result } = renderHook(() => useOnboardingState());

    act(() => {
      result.current.completeOnboarding();
    });
    expect(result.current.showOnboarding).toBe(false);

    act(() => {
      result.current.resetOnboarding();
    });
    expect(result.current.showOnboarding).toBe(true);
    expect(window.localStorage.getItem("claw3d:onboarding:completed")).toBeNull();
  });

  describe("with NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING=true", () => {
    const originalValue = process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING;

    beforeEach(() => {
      process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING = "true";
      vi.resetModules();
    });

    afterEach(() => {
      if (originalValue === undefined) {
        delete process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING;
      } else {
        process.env.NEXT_PUBLIC_CLAW3D_SKIP_ONBOARDING = originalValue;
      }
      vi.resetModules();
    });

    it("never shows onboarding regardless of localStorage", async () => {
      window.localStorage.removeItem("claw3d:onboarding:completed");
      const { useOnboardingState: hook } = await import(
        "@/features/onboarding/useOnboardingState"
      );
      const { result } = renderHook(() => hook());
      expect(result.current.showOnboarding).toBe(false);
    });

    it("overrides 'not completed' localStorage (env var wins)", async () => {
      // Without the patch this would return showOnboarding=true (localStorage says
      // not completed). With the patch, the env var short-circuits readCompleted()
      // to return true, so showOnboarding stays false. This is the real regression
      // signal for the env-var skip behavior.
      window.localStorage.setItem("claw3d:onboarding:completed", "false");
      const { useOnboardingState: hook } = await import(
        "@/features/onboarding/useOnboardingState"
      );
      const { result } = renderHook(() => hook());
      expect(result.current.showOnboarding).toBe(false);
    });
  });
});
