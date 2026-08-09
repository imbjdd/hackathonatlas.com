"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

export type DirectoryEvent = {
  id: string;
  title: string;
  city: string | null;
  startTime: string;
  endTime: string | null;
  link: string | null;
  cashPrize: number | null;
  tags: string[] | null;
  cover: string | null;
};

type Format = "all" | "in-person" | "online" | "hybrid";

const PAGE_SIZE = 100;
// Offset a page-change scroll below the sticky nav (72) + filter band (80).
const STICKY_OFFSET = 152;

const EMBLEM_COLORS = [
  "#0A0A0A", "#10A37F", "#D97757", "#5B6EF5", "#3ECF8E", "#9945FF",
  "#FF7000", "#E11D48", "#7C3AED", "#1C3C3C", "#F55036", "#20808D",
  "#635BFF", "#5E6AD2", "#F6821F", "#1B17F5", "#FFBE00", "#6D28D9",
];

function monogram(title: string): string {
  const words = title.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

function colorFor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return EMBLEM_COLORS[hash % EMBLEM_COLORS.length]!;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function hasTag(tags: string[] | null, ...needles: string[]): boolean {
  if (!tags) return false;
  const lower = tags.map((t) => t.toLowerCase());
  return needles.some((n) => lower.some((t) => t.includes(n)));
}

function normCity(e: DirectoryEvent): string | null {
  const c = e.city?.trim();
  return c && c.length > 0 ? c : null;
}

function classify(e: DirectoryEvent): Exclude<Format, "all"> {
  if (hasTag(e.tags, "hybrid")) return "hybrid";
  if (!normCity(e) || hasTag(e.tags, "online", "remote", "virtual")) return "online";
  return "in-person";
}

function eventTag(e: DirectoryEvent): { label: string } | null {
  if (e.cashPrize != null && e.cashPrize >= 20000) return { label: "Featured" };
  if (hasTag(e.tags, "open source", "oss", "open-source")) return { label: "OSS" };
  return null;
}

function EventLogo({ e, size, radius, fontSize }: { e: DirectoryEvent; size: number; radius: number; fontSize: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden font-bold tracking-[-0.02em] text-white${
        e.cover ? " bg-[#F4F4F5]" : ""
      }`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize,
        ...(e.cover ? {} : { backgroundColor: colorFor(e.title) }),
      }}
    >
      {e.cover ? (
        <Image
          src={e.cover}
          alt=""
          width={size}
          height={size}
          quality={60}
          sizes={`${size}px`}
          className="h-full w-full object-cover"
        />
      ) : (
        monogram(e.title)
      )}
    </span>
  );
}

const FORMAT_ICON: Record<Exclude<Format, "all">, React.ReactNode> = {
  "in-person": (
    <>
      <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  online: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9M12 3c-2.5 2.5-3.5 6-3.5 9s1 6.5 3.5 9" strokeWidth={1.6} />
    </>
  ),
  hybrid: <path d="M4 8l8-5 8 5v8l-8 5-8-5z" />,
};

function FilterRow({
  active,
  icon,
  label,
  count,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg p-2 text-left transition-colors ${
        active ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"
      }`}
    >
      <span className="flex items-center gap-2.5">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke={active ? "#18181B" : "#71717A"}
          strokeWidth={2}
          className="shrink-0"
          aria-hidden="true"
        >
          {icon}
        </svg>
        <span className={`text-[14px] font-medium ${active ? "text-[#18181B]" : "text-[#3F3F46]"}`}>
          {label}
        </span>
      </span>
      <span className="text-[13px] font-medium text-[#A1A1AA] tabular-nums">
        {count.toLocaleString("en-US")}
      </span>
    </button>
  );
}

function pageList(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "ellipsis")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push("ellipsis");
  for (let p = left; p <= right; p++) items.push(p);
  if (right < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

export function HackathonDirectory({ events }: { events: DirectoryEvent[] }) {
  const [format, setFormat] = useState<Format>("all");
  const [city, setCity] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [citySortAlpha, setCitySortAlpha] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // "/" focuses the search input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const formatCounts = useMemo(() => {
    const c = { "in-person": 0, online: 0, hybrid: 0 };
    for (const e of events) c[classify(e)]++;
    return c;
  }, [events]);

  const cityCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of events) {
      const c = normCity(e);
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    // Curated tech hubs first, then fill remaining slots with the busiest cities.
    const PREFERRED = ["San Francisco", "London", "Paris", "New York", "Bengaluru", "Singapore"];
    const picked: [string, number][] = [];
    const used = new Set<string>();
    for (const name of PREFERRED) {
      const n = map.get(name);
      if (n) {
        picked.push([name, n]);
        used.add(name);
      }
    }
    for (const [name, n] of [...map.entries()].sort((a, b) => b[1] - a[1])) {
      if (picked.length >= 6) break;
      if (used.has(name) || name === "Mountain View") continue;
      picked.push([name, n]);
      used.add(name);
    }
    return picked.slice(0, 6);
  }, [events]);

  const displayCities = useMemo(() => {
    if (!citySortAlpha) return cityCounts;
    return [...cityCounts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cityCounts, citySortAlpha]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (format !== "all" && classify(e) !== format) return false;
      if (city != null && normCity(e) !== city) return false;
      if (q) {
        const hay = `${e.title} ${e.city ?? ""} ${(e.tags ?? []).join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, format, city, query]);

  // Reset to the first page whenever the filtered set changes.
  useEffect(() => {
    setPage(1);
  }, [format, city, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  function goToPage(p: number) {
    const next = Math.min(Math.max(p, 1), pageCount);
    // Jump to the top of the grid (just under the sticky header) before the
    // re-render. The content row's position is independent of the page number,
    // and an instant jump avoids the no-op smooth scroll under `overflow: clip`.
    const el = contentRef.current;
    if (el) {
      window.scrollTo(0, Math.max(0, window.scrollY + el.getBoundingClientRect().top - STICKY_OFFSET));
    }
    setPage(next);
  }

  return (
    <div className="flex w-full flex-col border-t border-[#EAEAEA]">
      {/* Sticky band: Filters label aligned with the search toolbar */}
      <div className="sticky top-[71px] z-20 flex bg-white">
        {filtersOpen && (
          <div className="flex w-[264px] shrink-0 items-center justify-between border-b border-r border-[#EAEAEA] px-6 max-[900px]:hidden">
            <span className="flex items-center gap-[9px]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#18181B" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              <span className="text-[15px] font-semibold text-[#0A0A0A]">Filters</span>
            </span>
            <button
              type="button"
              onClick={() => setFiltersOpen(false)}
              aria-label="Hide filters"
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#A1A1AA] transition-colors hover:bg-[#F4F4F5] hover:text-[#18181B]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        {/* Search toolbar */}
        <div className="flex min-w-0 flex-1 items-center gap-3.5 border-b border-[#EAEAEA] px-6 py-4">
          {!filtersOpen && (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="flex shrink-0 items-center gap-2 rounded-[10px] border border-[#E4E4E7] px-3.5 py-[11px] text-[14px] font-medium text-[#18181B] transition-colors hover:bg-[#FAFAFA] max-[900px]:hidden"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 6h16M7 12h10M10 18h4" />
              </svg>
              Filters
            </button>
          )}
          <div className="flex flex-1 items-center gap-[11px] rounded-[10px] border border-[#EAEAEA] bg-[#FAFAFA] px-3.5 py-[11px] focus-within:border-[#D4D4D8]">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" className="shrink-0" aria-hidden="true">
              <circle cx="9" cy="9" r="6.25" stroke="#A1A1AA" strokeWidth="1.7" />
              <path d="M14 14L17.5 17.5" stroke="#A1A1AA" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search hackathons — try “AI agents”, “Solana”, “London”…"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[#18181B] outline-none placeholder:text-[#A1A1AA]"
            />
            <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md border border-[#E4E4E7] text-[13px] font-medium text-[#A1A1AA]">
              /
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-[2px] rounded-[9px] border border-[#E4E4E7] p-[3px]">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              className={`flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors ${view === "grid" ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={view === "grid" ? "#18181B" : "#A1A1AA"} strokeWidth="2" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              className={`flex h-[30px] w-[30px] items-center justify-center rounded-md transition-colors ${view === "list" ? "bg-[#F4F4F5]" : "hover:bg-[#FAFAFA]"}`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={view === "list" ? "#18181B" : "#A1A1AA"} strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content row: sidebar body + grid */}
      <div ref={contentRef} className="flex">
        {/* Sidebar — sticky so all filters stay visible while the grid scrolls */}
        {filtersOpen && (
        <div className="w-[264px] shrink-0 border-r border-[#EAEAEA] max-[900px]:hidden">
          <aside className="sticky top-[151px] flex flex-col gap-6 bg-white p-6">
          <div className="flex flex-col gap-1">
          <span className="px-2 pb-2 text-[11px] font-medium tracking-[0.07em] text-[#A1A1AA]">FORMAT</span>
          <FilterRow
            active={format === "all"}
            label="All"
            count={events.length}
            onClick={() => setFormat("all")}
            icon={
              <>
                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                <rect x="14" y="14" width="7" height="7" rx="1.5" />
              </>
            }
          />
          <FilterRow active={format === "in-person"} label="In person" count={formatCounts["in-person"]} onClick={() => setFormat("in-person")} icon={FORMAT_ICON["in-person"]} />
          <FilterRow active={format === "online"} label="Online" count={formatCounts.online} onClick={() => setFormat("online")} icon={FORMAT_ICON.online} />
          <FilterRow active={format === "hybrid"} label="Hybrid" count={formatCounts.hybrid} onClick={() => setFormat("hybrid")} icon={FORMAT_ICON.hybrid} />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-2 pb-2">
            <span className="text-[11px] font-medium tracking-[0.07em] text-[#A1A1AA]">LOCATION</span>
            <button
              type="button"
              onClick={() => setCitySortAlpha((v) => !v)}
              aria-label={citySortAlpha ? "Sort by count" : "Sort alphabetically"}
              title={citySortAlpha ? "Sorted A–Z" : "Sorted by count"}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-[#F4F4F5] ${citySortAlpha ? "text-[#18181B]" : "text-[#A1A1AA]"}`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l-3 3M17 20l3-3" />
              </svg>
            </button>
          </div>
          <FilterRow
            active={city === null}
            label="All locations"
            count={events.length}
            onClick={() => setCity(null)}
            icon={
              <>
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18" strokeWidth={1.6} />
              </>
            }
          />
          {displayCities.map(([name, count]) => (
            <FilterRow
              key={name}
              active={city === name}
              label={name}
              count={count}
              onClick={() => setCity(city === name ? null : name)}
              icon={
                <>
                  <path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" strokeWidth={1.8} />
                  <circle cx="12" cy="10" r="2.5" strokeWidth={1.8} />
                </>
              }
            />
          ))}
        </div>
        </aside>
        </div>
        )}

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Grid */}
        {filtered.length === 0 ? (
          <p className="px-6 py-16 text-center text-[15px] text-[#A1A1AA]">
            No hackathons match these filters.
          </p>
        ) : view === "grid" ? (
          <div className="flex flex-wrap" style={{ width: "calc(100% + 1px)", marginBottom: "-1px" }}>
            {paged.map((e) => {
              const tag = eventTag(e);
              const cell = (
                <>
                  <div className="flex h-[22px] w-full items-start">
                    {tag && (
                      <span className="rounded-full bg-[#FCEFCE] px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] text-[#B45309]">
                        {tag.label}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col items-center justify-center gap-3.5 py-2">
                    <EventLogo e={e} size={60} radius={15} fontSize={22} />
                    <span className="flex flex-col items-center gap-1">
                      <span className="line-clamp-1 text-center text-[14px] font-semibold text-[#18181B]">
                        {e.title}
                      </span>
                      <span className="text-[12px] text-[#A1A1AA]">
                        {formatDate(e.startTime)} · {normCity(e) ?? "Online"}
                      </span>
                    </span>
                  </div>
                </>
              );

              const cellClass =
                "flex min-h-[216px] shrink grow basis-1/5 min-w-0 flex-col border-b border-r border-[#EAEAEA] px-4 py-5 transition-colors";

              return e.link ? (
                <a
                  key={e.id}
                  href={e.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${cellClass} hover:bg-[#FAFAFA]`}
                >
                  {cell}
                </a>
              ) : (
                <div key={e.id} className={cellClass}>
                  {cell}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col">
            {paged.map((e) => {
              const tag = eventTag(e);
              const row = (
                <>
                  <EventLogo e={e} size={40} radius={11} fontSize={15} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-1 text-[14px] font-semibold text-[#18181B]">
                      {e.title}
                    </span>
                    <span className="text-[13px] text-[#A1A1AA]">
                      {formatDate(e.startTime)} · {normCity(e) ?? "Online"}
                    </span>
                  </span>
                  {tag && (
                    <span className="shrink-0 rounded-full bg-[#FCEFCE] px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] text-[#B45309]">
                      {tag.label}
                    </span>
                  )}
                  {e.link && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4D4D8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  )}
                </>
              );

              const rowClass =
                "flex items-center gap-4 border-b border-[#EAEAEA] px-6 py-3.5 transition-colors";

              return e.link ? (
                <a
                  key={e.id}
                  href={e.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${rowClass} hover:bg-[#FAFAFA]`}
                >
                  {row}
                </a>
              ) : (
                <div key={e.id} className={rowClass}>
                  {row}
                </div>
              );
            })}
          </div>
        )}

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#EAEAEA] px-6 py-4">
              <span className="text-[13px] text-[#A1A1AA] tabular-nums">
                {rangeStart}–{rangeEnd} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="flex h-8 items-center gap-1 rounded-lg border border-[#E4E4E7] pl-2 pr-3 text-[13px] font-medium text-[#18181B] transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Prev
                </button>
                {pageList(currentPage, pageCount).map((p, i) =>
                  p === "ellipsis" ? (
                    <span key={`e${i}`} className="px-1 text-[13px] text-[#A1A1AA]">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => goToPage(p)}
                      aria-current={p === currentPage ? "page" : undefined}
                      className={`h-8 min-w-8 rounded-lg px-2 text-[13px] font-medium tabular-nums transition-colors ${
                        p === currentPage
                          ? "bg-[#0A0A0A] text-white"
                          : "text-[#18181B] hover:bg-[#FAFAFA]"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === pageCount}
                  className="flex h-8 items-center gap-1 rounded-lg border border-[#E4E4E7] pl-3 pr-2 text-[13px] font-medium text-[#18181B] transition-colors hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
