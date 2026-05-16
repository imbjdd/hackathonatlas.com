import Link from "next/link";

const navButtonClassName =
  "inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-3 py-2 text-sm font-medium transition-[color,box-shadow] outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 max-[640px]:px-2 max-[640px]:text-[13px]";

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

export async function Navbar() {
  const stars = await getGitHubStars();

  return (
    <nav className="relative z-[10000] flex w-full items-center justify-between gap-2 px-[100px] py-[35px] text-base font-medium leading-5 max-[1024px]:px-10 max-[1024px]:py-6 max-[640px]:px-4 max-[640px]:py-4">
      <Link href="/" className="shrink-0 font-[family-name:var(--font-inter)] max-[640px]:text-[15px]">
        Hackathon Atlas
      </Link>

      <div className="ml-auto flex items-center gap-1 max-[640px]:gap-0.5">
        <Link href="/explore-hackathons" className={navButtonClassName}>
          <span className="max-[640px]:hidden">Explore Hackathons</span>
          <span className="hidden max-[640px]:inline">Explore</span>
        </Link>

        <Link href="/about" className={navButtonClassName}>
          About
        </Link>

        <a
          href="https://github.com/imbjdd/hackathonatlas.com"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-white px-4 py-2 text-xs leading-4 max-[640px]:px-2"
        >
          <svg viewBox="0 0 14 14" width="14" height="14" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <path d="M 6.979 0 C 3.12 0 0 3.143 0 7.031 C 0 10.139 1.999 12.77 4.772 13.701 C 5.119 13.771 5.246 13.55 5.246 13.364 C 5.246 13.201 5.234 12.642 5.234 12.06 C 3.293 12.479 2.889 11.222 2.889 11.222 C 2.577 10.407 2.114 10.197 2.114 10.197 C 1.479 9.767 2.161 9.767 2.161 9.767 C 2.866 9.813 3.235 10.488 3.235 10.488 C 3.859 11.559 4.865 11.257 5.269 11.07 C 5.327 10.616 5.512 10.302 5.708 10.127 C 4.16 9.964 2.531 9.359 2.531 6.658 C 2.531 5.89 2.808 5.262 3.247 4.773 C 3.178 4.598 2.935 3.876 3.316 2.91 C 3.316 2.91 3.906 2.724 5.234 3.632 C 5.803 3.478 6.39 3.4 6.979 3.399 C 7.568 3.399 8.169 3.481 8.724 3.632 C 10.053 2.724 10.642 2.91 10.642 2.91 C 11.023 3.876 10.781 4.598 10.711 4.773 C 11.162 5.262 11.428 5.89 11.428 6.658 C 11.428 9.359 9.799 9.953 8.239 10.127 C 8.493 10.349 8.712 10.768 8.712 11.431 C 8.712 12.374 8.701 13.131 8.701 13.363 C 8.701 13.55 8.828 13.771 9.175 13.701 C 11.948 12.77 13.947 10.139 13.947 7.031 C 13.958 3.143 10.827 0 6.979 0 Z" fill="#474747" />
          </svg>
          {stars != null && (
            <span className="shrink-0 font-[family-name:var(--font-gabarito)] text-base leading-6 text-[#474747] max-[640px]:hidden">
              {formatStars(stars)}
            </span>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="14" height="14" className="shrink-0 max-[640px]:hidden" fill="#B3B3B3">
            <path d="M200,64V168a8,8,0,0,1-16,0V83.31L69.66,197.66a8,8,0,0,1-11.32-11.32L172.69,72H88a8,8,0,0,1,0-16H192A8,8,0,0,1,200,64Z" />
          </svg>
        </a>
      </div>
    </nav>
  );
}
