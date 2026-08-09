import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "../../../src/db";
import { events } from "../../../src/db/schema";
import { TopNav } from "../../top-nav";
import { SiteFooter } from "../../site-footer";

export const dynamic = "force-dynamic";

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

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

// Full-resolution cover: remote URLs pass through, S3 keys go through the
// images proxy (which serves the original when no thumbnail exists).
function coverSrc(coverUrl: string | null): string | null {
  if (!coverUrl) return null;
  if (coverUrl.startsWith("http")) return coverUrl;
  return `/api/images?key=${encodeURIComponent(coverUrl)}`;
}

function modeLabel(mode: string | null): string | null {
  if (mode === "online") return "Online";
  if (mode === "hybrid") return "Hybrid";
  if (mode === "in_person") return "In person";
  return null;
}

function locationLabel(city: string | null, country: string | null): string {
  const parts = [city?.trim(), country?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "Online";
}

function formatDateRange(start: Date, end: Date | null): string {
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
  const startStr = start.toLocaleDateString("en-US", opts);
  if (!end) return startStr;
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) return startStr;
  const sameMonth =
    start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth();
  if (sameMonth) {
    const endStr = end.toLocaleDateString("en-US", { day: "numeric", year: "numeric" });
    return `${start.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${endStr}`;
  }
  return `${startStr} – ${end.toLocaleDateString("en-US", opts)}`;
}

async function getEvent(id: string) {
  const rows = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) return { title: "Hackathon not found — Hackathon Atlas" };
  return {
    title: `${event.title} — Hackathon Atlas`,
    description: event.description?.slice(0, 200) ?? undefined,
  };
}

function StatIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A1A1AA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-[2px] shrink-0" aria-hidden="true">
      {children}
    </svg>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-6 py-4">
      <StatIcon>{icon}</StatIcon>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[12px] font-medium tracking-[0.04em] text-[#A1A1AA]">{label}</span>
        <span className="text-[15px] font-medium text-[#18181B]">{value}</span>
      </div>
    </div>
  );
}

export default async function HackathonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  // Collapse the scraped description's whitespace into a single flowing block
  // so the clamped excerpt reads cleanly instead of as choppy per-line text.
  const summary = event.description?.replace(/\s+/g, " ").trim() || null;
  const cover = coverSrc(event.coverUrl);
  const start = event.startTime;
  const end = event.endTime;
  const mode = modeLabel(event.mode);
  const location = locationLabel(event.city, event.country);
  const isNew =
    event.createdAt != null && Date.now() - event.createdAt.getTime() < NEW_WINDOW_MS;

  return (
    <div
      className="flex min-h-screen flex-col items-center bg-white"
      style={{ fontFamily: "var(--font-geist), system-ui, sans-serif" }}
    >
      <TopNav />

      <div className="flex w-full max-w-[1320px] flex-col border-x border-[#EAEAEA]">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 border-b border-[#EAEAEA] px-16 py-3.5 text-[13px] max-[720px]:px-8">
          <Link href="/" className="text-[#71717A] transition-colors hover:text-[#0A0A0A]">
            Hackathons
          </Link>
          <span className="text-[#D4D4D8]">/</span>
          <span className="line-clamp-1 text-[#18181B]">{event.title}</span>
        </div>

        {/* Hero */}
        <section className="relative flex flex-col gap-7 px-16 py-14 max-[720px]:px-8">
          <div className="flex flex-wrap items-center gap-6">
            <span
              className={`flex h-[88px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] text-[30px] font-bold tracking-[-0.02em] text-white${
                cover ? " bg-[#F4F4F5]" : ""
              }`}
              style={cover ? undefined : { backgroundColor: colorFor(event.title) }}
            >
              {cover ? (
                <Image
                  src={cover}
                  alt=""
                  width={88}
                  height={88}
                  quality={80}
                  sizes="88px"
                  className="h-full w-full object-cover"
                />
              ) : (
                monogram(event.title)
              )}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {isNew && (
                  <span className="rounded-full bg-[#DCFCE7] px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] text-[#15803D]">
                    New
                  </span>
                )}
                {mode && (
                  <span className="rounded-full border border-[#E4E4E7] px-2.5 py-[3px] text-[11px] font-medium text-[#52525B]">
                    {mode}
                  </span>
                )}
                {event.cashPrize != null && event.cashPrize >= 20000 && (
                  <span className="rounded-full bg-[#FCEFCE] px-2 py-[3px] text-[11px] font-semibold tracking-[0.02em] text-[#B45309]">
                    Featured
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <h1 className="max-w-[820px] text-[40px] font-bold leading-[44px] tracking-[-0.03em] text-[#0A0A0A] max-[720px]:text-[30px] max-[720px]:leading-[34px]">
                  {event.title}
                </h1>
                <p className="text-[16px] text-[#71717A]">
                  {formatDateRange(start, end)} · {location}
                </p>
              </div>
            </div>

            {event.link && (
              <a
                href={event.link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-full bg-[#0A0A0A] px-5 py-[11px] transition-opacity hover:opacity-90"
              >
                {/* text-white must live on a child, not the <a>: the unlayered
                    `a { color: inherit }` in globals.css outranks Tailwind's
                    layered utilities and would otherwise force the label black. */}
                <span className="flex items-center gap-2 text-[14px] font-medium text-white">
                  Register
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M7 17L17 7M9 7h8v8" />
                  </svg>
                </span>
              </a>
            )}
          </div>

          {/* Blueprint frame — same motif as the landing hero */}
          <div className="pointer-events-none absolute inset-x-0 top-6 h-px bg-[#EFEFEF]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-6 h-px bg-[#EFEFEF]" />
          {["left-[-6px] top-[18px]", "right-[-6px] top-[18px]", "bottom-[18px] left-[-6px]", "bottom-[18px] right-[-6px]"].map((pos) => (
            <div key={pos} className={`pointer-events-none absolute h-3 w-3 ${pos}`}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M6 0V12M0 6H12" stroke="#C9C9CE" />
              </svg>
            </div>
          ))}
        </section>

        {/* Body: description + details */}
        <div className="flex border-t border-[#EAEAEA] max-[900px]:flex-col">
          <div className="flex min-w-0 flex-1 flex-col gap-5 border-r border-[#EAEAEA] px-16 py-12 max-[900px]:border-b max-[900px]:border-r-0 max-[720px]:px-8">
            <h2 className="text-[13px] font-medium tracking-[0.07em] text-[#A1A1AA]">ABOUT</h2>
            {summary ? (
              <div className="flex max-w-[680px] flex-col gap-3">
                {/* Scraped descriptions are noisy (emoji walls, inline links), so
                    show a tidy 3-line excerpt and send readers to the source. */}
                <p className="line-clamp-3 text-[16px] leading-[27px] text-[#3F3F46]">
                  {summary}
                </p>
                {event.link && (
                  <a
                    href={event.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-fit items-center gap-1.5 text-[14px] font-medium text-[#18181B] transition-colors hover:text-[#0A0A0A]"
                  >
                    Read the full details
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 17L17 7M9 7h8v8" />
                    </svg>
                  </a>
                )}
              </div>
            ) : (
              <p className="text-[15px] text-[#A1A1AA]">
                No description available yet.
                {event.link && (
                  <>
                    {" "}
                    <a href={event.link} target="_blank" rel="noopener noreferrer" className="text-[#18181B] underline underline-offset-2">
                      See the full listing
                    </a>
                    .
                  </>
                )}
              </p>
            )}

            {event.tags && event.tags.length > 0 && (
              <div className="mt-2 flex flex-col gap-3">
                <h3 className="text-[13px] font-medium tracking-[0.07em] text-[#A1A1AA]">TAGS</h3>
                <div className="flex flex-wrap gap-2">
                  {event.tags.map((t) => (
                    <span key={t} className="rounded-full border border-[#E4E4E7] px-3 py-1 text-[13px] text-[#3F3F46]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Details sidebar */}
          <aside className="w-[340px] shrink-0 divide-y divide-[#EAEAEA] py-4 max-[900px]:w-full">
            <DetailRow
              label="DATE"
              value={formatDateRange(start, end)}
              icon={<><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>}
            />
            <DetailRow
              label="LOCATION"
              value={event.venue ? `${event.venue} · ${location}` : location}
              icon={<><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>}
            />
            {mode && (
              <DetailRow
                label="FORMAT"
                value={mode}
                icon={<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9M12 3c-2.5 2.5-3.5 6-3.5 9s1 6.5 3.5 9" /></>}
              />
            )}
            {event.cashPrize != null && event.cashPrize > 0 && (
              <DetailRow
                label="PRIZE POOL"
                value={`$${event.cashPrize.toLocaleString("en-US")}`}
                icon={<><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5a2.5 2 0 013 -0.5c1.5 .5 1.5 2 0 2.5s-1.5 2 0 2.5a2.5 2 0 01-3 -0.5" /></>}
              />
            )}
            {event.participantsCount != null && event.participantsCount > 0 && (
              <DetailRow
                label="PARTICIPANTS"
                value={event.participantsCount.toLocaleString("en-US")}
                icon={<><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></>}
              />
            )}
            {event.link && (
              <DetailRow
                label="LINK"
                value={
                  <a href={event.link} target="_blank" rel="noopener noreferrer" className="break-all text-[#18181B] underline underline-offset-2">
                    Official page
                  </a>
                }
                icon={<><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></>}
              />
            )}
          </aside>
        </div>

        <SiteFooter />
      </div>
    </div>
  );
}
