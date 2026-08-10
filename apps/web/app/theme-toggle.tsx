"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function apply(next: "light" | "dark") {
    const root = document.documentElement;
    // Freeze every transition so the whole page recolors in one paint — no
    // element lags behind and flashes. Lifted on the next frame so hover
    // transitions work again immediately after.
    root.classList.add("theme-switching");
    setTheme(next);
    root.classList.toggle("dark", next === "dark");
    // Force the new colors to be computed while transitions are still frozen.
    void root.offsetHeight;
    requestAnimationFrame(() => root.classList.remove("theme-switching"));
    // Persist to a cookie so the server can render the right `dark` class on the
    // <html> tag on the next load. Under React 19 a class added client-side to
    // <html> is stripped during hydration, so relying on localStorage + an inline
    // script alone loses the theme on refresh. localStorage stays as a fallback.
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }

  function toggle() {
    apply(theme === "light" ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      role="switch"
      aria-checked={theme === "dark"}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className="relative flex items-center gap-[2px] rounded-full border border-[#E4E4E7] p-[5px] transition-colors max-[640px]:hidden"
    >
      {/* Sliding highlight — animates between the two icons */}
      <span
        aria-hidden="true"
        data-theme-slider
        className="pointer-events-none absolute top-[5px] left-[5px] h-[26px] w-[26px] rounded-full bg-[#F4F4F5] transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{ transform: theme === "dark" ? "translateX(28px)" : "translateX(0)" }}
      />
      {/* Sun (day) */}
      <span className="relative z-10 flex h-[26px] w-[26px] items-center justify-center">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme === "light" ? "#18181B" : "#A1A1AA"}
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-colors duration-300"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M6 6L4.5 4.5M19.5 19.5L18 18M18 6l1.5-1.5M4.5 19.5L6 18" />
        </svg>
      </span>
      {/* Moon (night) */}
      <span className="relative z-10 flex h-[26px] w-[26px] items-center justify-center">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill={theme === "dark" ? "#EDEDED" : "#A1A1AA"}
          className="transition-colors duration-300"
          aria-hidden="true"
        >
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      </span>
    </button>
  );
}
