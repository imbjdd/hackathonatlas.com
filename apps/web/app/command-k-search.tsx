"use client";

import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./command-k-search.module.css";

type SearchResult = {
  id: string;
  title: string;
  city: string | null;
  startTime: string;
  endTime: string | null;
  link: string | null;
};

function formatDateRange(start: string, end: string | null): string {
  const startDate = new Date(start).toLocaleDateString("fr-FR");
  if (!end) return `${startDate} - TBD`;
  return `${startDate} - ${new Date(end).toLocaleDateString("fr-FR")}`;
}

export function CommandKSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const openSearch = () => setOpen(true);
    window.addEventListener("open-command-k-search", openSearch);
    return () => window.removeEventListener("open-command-k-search", openSearch);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setActiveIndex(0);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/hackathons/search?q=${encodeURIComponent(query.trim())}&limit=8`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error("Search failed");
        const data = (await res.json()) as SearchResult[];
        setResults(data);
        setActiveIndex(0);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 170);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query, open]);

  const hint = useMemo(() => {
    if (query.trim().length < 2) return "Type at least 2 characters";
    if (loading) return "Searching...";
    if (results.length === 0) return "No hackathon found";
    return `${results.length} result${results.length > 1 ? "s" : ""}`;
  }, [loading, query, results.length]);

  function close() {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActiveIndex(0);
  }

  function navigateTo(item: SearchResult) {
    close();
    if (item.link && item.link.startsWith("http")) {
      window.open(item.link, "_blank", "noopener,noreferrer");
      return;
    }

    router.push("/");
  }

  function onDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      navigateTo(results[activeIndex]);
    }
  }

  return (
    <>
      {open && (
        <div className={styles.overlay} onClick={close}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()} onKeyDown={onDialogKeyDown}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search hackathons by title, city, or description..."
              className={styles.input}
            />
            <div className={styles.hint}>{hint}</div>
            <div className={styles.list}>
              {query.trim().length >= 2 && results.length === 0 && !loading ? (
                <p className={styles.empty}>No upcoming hackathons match this query.</p>
              ) : (
                results.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.item} ${index === activeIndex ? styles.itemActive : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => navigateTo(item)}
                  >
                    <span className={styles.title}>{item.title}</span>
                    <span className={styles.meta}>
                      {item.city ?? "No city"} • {formatDateRange(item.startTime, item.endTime)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
