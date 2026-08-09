"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function apply(next: "light" | "dark") {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-center gap-[2px] rounded-full border border-[#E4E4E7] p-[5px] max-[640px]:hidden">
      <button
        type="button"
        onClick={() => apply("light")}
        aria-label="Light theme"
        aria-pressed={theme === "light"}
        className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition-colors ${
          theme === "light" ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"
        }`}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke={theme === "light" ? "#18181B" : "#A1A1AA"}
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M6 6L4.5 4.5M19.5 19.5L18 18M18 6l1.5-1.5M4.5 19.5L6 18" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => apply("dark")}
        aria-label="Dark theme"
        aria-pressed={theme === "dark"}
        className={`flex h-[26px] w-[26px] items-center justify-center rounded-full transition-colors ${
          theme === "dark" ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill={theme === "dark" ? "#EDEDED" : "#A1A1AA"} aria-hidden="true">
          <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
        </svg>
      </button>
    </div>
  );
}
