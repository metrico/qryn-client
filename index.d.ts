declare module 'gigapipe-client' {
  // === Core types ===

  export interface RetryOptions {
    attempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    retryOn?: (status: number, attempt: number) => boolean;
  }

  export interface ReadOpts {
    signal?: AbortSignal;
    timeoutMs?: number;
    retry?: RetryOptions;
    orgId?: string;
  }

  export type GigapipeAuth =
    | { type: 'basic'; username: string; password: string }
    | { type: 'bearer'; token: string | (() => Promise<string>) }
    | { type: 'custom'; headers: Record<string, string> | (() => Promise<Record<string, string>>) }
    | { username: string; password: string }; // legacy

  export interface GigapipeClientOptions {
    baseUrl?: string;
    auth?: GigapipeAuth;
    headers?: Record<string, string>;
    timeout?: number;
    retry?: RetryOptions;
    defaultOrgId?: string;
  }

  // === Errors ===

  export class GigapipeError extends Error {
    constructor(message: string, statusCode?: number | null, cause?: unknown, path?: string);
    statusCode: number | null;
    cause: unknown;
    path: string | undefined;
  }
  export class GigapipeAbortedError extends GigapipeError {
    constructor(message: string, options?: { reason?: unknown; path?: string });
    reason?: unknown;
  }
  export class GigapipeTimeoutError extends GigapipeError {
    constructor(message: string, options?: { elapsedMs?: number; path?: string });
    elapsedMs: number;
  }

  // === Response envelope ===

  export class GigapipeResponse<T = unknown> {
    response: T;
    status: number;
    headers: Headers;
    path: string;
    readonly isSuccess: boolean;
    readonly getStatus: number;
    readonly getHeaders: Record<string, string>;
    getData(): T;
    getHeader(name: string): string | null;
    toString(): string;
  }

  // === Loki ===

  export interface LokiQueryOptions {
    limit?: number;
    start?: number | string;
    end?: number | string;
    step?: number | string;
    parse?: boolean;
  }

  export class Stream {
    constructor(labels: Record<string, string>);
    labels: Record<string, string>;
    entries: Array<{ ts: string; line: string }>;
    addEntry(timestamp: number | Date | string, line: string): void;
    addListener(callback: (...args: any[]) => void): void;
    confirm(): void;
    undo(): void;
    reset(): void;
    collect(): { labels: string; entries: Array<{ ts: string; line: string }> };
  }

  export interface LokiReader {
    query(query: string, queryOptions?: LokiQueryOptions, opts?: ReadOpts): Promise<GigapipeResponse>;
    queryRange(
      query: string,
      start: number | string,
      end: number | string,
      queryOptions?: LokiQueryOptions,
      opts?: ReadOpts
    ): Promise<GigapipeResponse>;
    labels(
      queryOptions?: { start?: number | string; end?: number | string },
      opts?: ReadOpts
    ): Promise<GigapipeResponse>;
    labelValues(
      labelName: string,
      queryOptions?: { start?: number | string; end?: number | string },
      opts?: ReadOpts
    ): Promise<GigapipeResponse>;
    series(
      match: string | string[],
      queryOptions?: { start?: number | string; end?: number | string },
      opts?: ReadOpts
    ): Promise<GigapipeResponse>;
  }

  export interface ParsedLogEntry {
    timestamp: string;
    timestampMs: number;
    date: Date;
    dateISO: string;
    message: unknown;
    labels: Record<string, string>;
  }

  export interface LokiClient {
    push(streams: Stream[], opts?: ReadOpts & { async?: string; fpLimit?: number; ttlDays?: number }): Promise<GigapipeResponse>;
    createReader(options?: { orgId?: string }): LokiReader;
    parseLogs(result: GigapipeResponse): ParsedLogEntry[];
  }

  // === Prometheus ===

  export class Metric {
    constructor(name: string, labels?: Record<string, string>);
    name: string;
    labels: Record<string, string>;
    samples: Array<{ value: number; timestamp: number }>;
    addSample(value: number, timestamp?: number): void;
    confirm(): void;
    undo(): void;
    collect(): { labels: Array<{ name: string; value: string }>; samples: Array<{ value: number; timestamp: number }> };
  }

  export interface PromReader {
    query(query: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    queryRange(query: string, start: number | string, end: number | string, step: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    labels(opts?: ReadOpts): Promise<GigapipeResponse>;
    labelValues(labelName: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    series(match: string | string[], start: number | string, end: number | string, opts?: ReadOpts): Promise<GigapipeResponse>;
    rules(opts?: ReadOpts): Promise<GigapipeResponse>;
  }

  export interface PromClient {
    push(metrics: Metric[], opts?: ReadOpts & { async?: string; fpLimit?: number; ttlDays?: number }): Promise<GigapipeResponse>;
    createReader(options?: { orgId?: string }): PromReader;
  }

  // === Tempo ===

  export interface TempoClient {
    search(searchParams?: string | URLSearchParams, opts?: ReadOpts): Promise<GigapipeResponse>;
    searchTags(scope?: 'span' | 'resource' | 'intrinsic', opts?: ReadOpts): Promise<GigapipeResponse>;
    searchTagValues(tag: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    searchTagValuesV2(tagName: string, searchParams?: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    getTrace(traceId: string, opts?: ReadOpts): Promise<GigapipeResponse>;
    getTraceSpansJson(traceID: string, opts?: ReadOpts): Promise<GigapipeResponse>;
  }

  // === Collector ===

  export class Collector {
    constructor(client: GigapipeClient, config?: { maxBulkSize?: number; maxTimeout?: number });
    add(item: Stream | Metric): void;
    flush(): Promise<void>;
  }

  // === Client ===

  export class GigapipeClient {
    constructor(config: GigapipeClientOptions);
    loki: LokiClient;
    prom: PromClient;
    tempo: TempoClient;
    createCollector(config?: { maxBulkSize?: number; maxTimeout?: number }): Collector;
    createStream(labels: Record<string, string>): Stream;
    createMetric(args: { name: string; labels?: Record<string, string> }): Metric;
  }
}
