import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

const GITHUB_REPO = "https://github.com/imbjdd/hackathonatlas.com";

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

async function getGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch("https://api.github.com/repos/imbjdd/hackathonatlas.com", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.stargazers_count ?? null;
  } catch {
    return null;
  }
}

export async function TopNav() {
  const stars = await getGitHubStars();

  return (
    <nav className="sticky top-0 z-30 flex w-full justify-center border-b border-[#EAEAEA] bg-white">
    <div className="flex w-full max-w-[1320px] items-center justify-between px-6 py-4 md:px-16">
      <Link href="/" className="flex items-center gap-2.5">
        <span className="flex h-[26px] w-[26px] flex-wrap content-center items-center justify-center gap-[2px] rounded-[7px] bg-[#0A0A0A] p-1.5">
          <span className="h-1 w-1 rounded-[1px] bg-white" />
          <span className="h-1 w-1 rounded-[1px] bg-white" />
          <span className="h-1 w-1 rounded-[1px] bg-white" />
          <span className="h-1 w-1 rounded-[1px] bg-[#7A7A7A]" />
        </span>
        <span className="text-[16px] font-semibold tracking-[-0.01em] text-[#0A0A0A]">
          Hackathon Atlas
        </span>
        <span className="text-[15px] text-[#A1A1AA] max-[520px]:hidden">by Salim</span>
      </Link>

      <div className="flex items-center gap-2.5">
        <a
          href={`${GITHUB_REPO}/issues/new`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-[7px] rounded-full border border-[#E4E4E7] px-[15px] py-2 transition-colors hover:bg-[#FAFAFA] max-[520px]:hidden"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M7 2V12M2 7H12" stroke="#52525B" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="text-[14px] font-medium text-[#18181B]">Submit</span>
        </a>

        <a
          href={GITHUB_REPO}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-[7px] rounded-full bg-[#0A0A0A] px-[15px] py-2 transition-opacity hover:opacity-90"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="#FFFFFF" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span className="text-[14px] font-medium text-white">GitHub</span>
          {stars != null && (
            <span className="text-[13px] font-medium text-white/70 max-[640px]:hidden">
              {formatStars(stars)}
            </span>
          )}
        </a>

        <ThemeToggle />
      </div>
    </div>
    </nav>
  );
}
