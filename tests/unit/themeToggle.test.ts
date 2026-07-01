import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ThemeToggle } from "@/components/theme-toggle";

const buildMatchMedia = (matches: boolean) =>
  vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
    vi.stubGlobal("matchMedia", buildMatchMedia(false));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  const openMenu = () => fireEvent.click(screen.getByTestId("theme-picker-toggle"));

  it("applies and persists a selected theme", () => {
    render(createElement(ThemeToggle));

    openMenu();
    fireEvent.click(screen.getByTestId("theme-option-neon"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("neon");
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem("claw3d-theme")).toBe("neon");

    openMenu();
    fireEvent.click(screen.getByTestId("theme-option-clean"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("clean");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem("claw3d-theme")).toBe("clean");
  });

  it("reads and applies a stored theme on mount", async () => {
    window.localStorage.setItem("claw3d-theme", "neon");

    render(createElement(ThemeToggle));

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("neon");
    });
    expect(document.documentElement).toHaveClass("dark");
  });

  it("migrates the legacy binary theme key on mount", async () => {
    window.localStorage.setItem("theme", "light");

    render(createElement(ThemeToggle));

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("clean");
    });
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
