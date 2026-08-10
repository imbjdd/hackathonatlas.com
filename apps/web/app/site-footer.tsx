import Link from "next/link";
import { LogoMark } from "./logo-mark";

const GITHUB_REPO = "https://github.com/imbjdd/hackathonatlas.com";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "PROJECT",
    links: [
      { label: "Stats", href: "/stats" },
      { label: "Submit an event", href: `${GITHUB_REPO}/issues/new`, external: true },
      { label: "GitHub", href: GITHUB_REPO, external: true },
    ],
  },
  {
    title: "AUTHOR",
    links: [
      { label: "Website", href: "https://boujaddi.com/", external: true },
      { label: "X (Twitter)", href: "https://x.com/salimboujaddi", external: true },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/salim-boujaddi", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="flex w-full flex-col border-t border-[#EAEAEA]">
      <div className="flex flex-wrap items-start justify-between gap-12 px-6 pb-10 pt-12 md:px-16">
        <div className="flex max-w-[300px] flex-col gap-3.5">
          <div className="flex items-center gap-[9px]">
            <LogoMark size={24} />
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#0A0A0A]">
              Hackathon Atlas
            </span>
          </div>
          <p className="text-[14px] leading-[21px] text-[#A1A1AA]">
            The open directory of hackathons worldwide. Built by builders, for builders.
          </p>
        </div>

        <div className="flex gap-16">
          {COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-3">
              <span className="text-[12px] font-medium tracking-[0.04em] text-[#A1A1AA]">
                {col.title}
              </span>
              {col.links.map((link) =>
                link.external ? (
                  <a
                    key={link.label}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] text-[#3F3F46] transition-colors hover:text-[#0A0A0A]"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="text-[14px] text-[#3F3F46] transition-colors hover:text-[#0A0A0A]"
                  >
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#EAEAEA] px-6 py-5 md:px-16">
        <span className="text-[13px] text-[#A1A1AA]">© 2026 Hackathon Atlas — Built by Salim</span>
        <div className="flex items-center gap-5">
          <span className="text-[13px] text-[#A1A1AA]">Updated live</span>
          <span className="text-[13px] text-[#A1A1AA]">MIT License</span>
          <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer" className="text-[13px] text-[#A1A1AA] transition-colors hover:text-[#0A0A0A]">
            Status
          </a>
        </div>
      </div>
    </footer>
  );
}
