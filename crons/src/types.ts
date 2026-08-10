// Shared types for the cron scrapers.
//
// A "source" is anything that can produce hackathon events (Luma, Devpost,
// MLH, ...). Each source normalizes its own data into `NormalizedEvent` so the
// runner can dedup and push everything through a single pipeline.

/** An event normalized to the shape the hackathons API expects. */
export type NormalizedEvent = {
  title: string;
  description: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  /** ISO 8601 start timestamp. */
  startTime: string;
  /** ISO 8601 end timestamp. */
  endTime: string;
  /** Canonical, de-dup key. Must be stable for a given event. */
  link: string;
  /** Cash prize in USD, or -1 when unknown. */
  cashPrize: number;
  tags: string[];
  participantsCount: number;
  coverUrl: string;
};

/** Context handed to every source at fetch time. */
export type SourceContext = {
  /** Max events the source should return this run. */
  limit: number;
  /** Base delay (seconds) between paginated requests; sources add jitter. */
  delay: number;
  /** Only keep events starting on/after this date. */
  after?: Date;
  /** Only keep events starting on/before this date. */
  before?: Date;
  /** Free-text query filter, when the source supports it. */
  query?: string;
  /** Whether to fetch full descriptions (can be slow / extra requests). */
  includeDescriptions: boolean;
  /** Structured logger scoped to the source. */
  log: (message: string) => void;
};

/** A pluggable data source. Add a new one by implementing this interface. */
export type Source = {
  /** Stable identifier, e.g. "luma". Used in logs and config. */
  readonly name: string;
  /** Fetch and normalize events for this run. */
  fetchEvents(ctx: SourceContext): Promise<NormalizedEvent[]>;
};
