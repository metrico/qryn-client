// Hand-written TypeScript surface for qryn-client.
// Augments declarations generated from JSDoc with named response types and
// generic QrynResponse<T>. The runtime contract is the JS source in src/.

import type { Agent } from 'http';

// -- core errors --

export class QrynError extends Error {
  statusCode: number | null;
  cause?: unknown;
  path?: string;
  constructor(message: string, statusCode?: number | null, cause?: unknown, path?: string);
}

export class QrynAbortedError extends QrynError {
  reason?: unknown;
}

export class QrynTimeoutError extends QrynError {
  elapsedMs: number;
}

// -- response wrapper --

export class QrynResponse<T = unknown> {
  response: T;
  status: number;
  headers: Headers | Record<string, string>;
  path: string;
  isSuccess(): boolean;
  getData(): T;
}

// -- auth --

export interface BasicAuth { type: 'basic'; username: string; password: string; }
export interface BearerAuth { type: 'bearer'; token: string | (() => Promise<string>); }
export interface CustomAuth {
  type: 'custom';
  headers: Record<string, string> | (() => Promise<Record<string, string>>);
}
export type QrynAuth = BasicAuth | BearerAuth | CustomAuth;

// -- retry / read opts --

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

// -- client config --

export interface QrynClientOptions {
  baseUrl?: string;
  auth?: QrynAuth | { username: string; password: string };  // legacy shape accepted (deprecated)
  headers?: Record<string, string>;
  timeout?: number;
  retry?: RetryOptions;
  defaultOrgId?: string;
  agent?: Agent;
}

// -- Loki --

export interface Stream {
  addEntry(timestamp: number | string | Date, line: string): void;
}

export interface LokiPushOptions extends ReadOpts {
  async?: boolean | string;
  fpLimit?: number;
  ttlDays?: number;
}

export interface LokiInstantResponse {
  status: 'success' | string;
  data: { resultType: string; result: unknown[] };
}
export interface LokiRangeResponse extends LokiInstantResponse {}
export interface SeriesResponse {
  status: 'success' | string;
  data: Array<Record<string, string>>;
}

export class LokiReader {
  query(query: string, time?: Date | number | string, opts?: ReadOpts): Promise<QrynResponse<LokiInstantResponse>>;
  queryRange(
    query: string,
    start: Date | number | string,
    end: Date | number | string,
    step?: string,
    limit?: number,
    direction?: 'forward' | 'backward',
    opts?: ReadOpts
  ): Promise<QrynResponse<LokiRangeResponse>>;
  labels(start?: Date | number | string, end?: Date | number | string, opts?: ReadOpts): Promise<QrynResponse<{ status: string; data: string[] }>>;
  labelValues(label: string, start?: Date | number | string, end?: Date | number | string, match?: string, opts?: ReadOpts): Promise<QrynResponse<{ status: string; data: string[] }>>;
  series(matchers: string[] | string, start?: Date | number | string, end?: Date | number | string, opts?: ReadOpts): Promise<QrynResponse<SeriesResponse>>;
}

export class Loki {
  push(streams: Stream[], options?: LokiPushOptions): Promise<QrynResponse<unknown>>;
  createReader(options?: { orgId?: string }): LokiReader;
}

// -- Prometheus --

export interface Metric {
  addSample(value: number, timestamp?: number): void;
}

export interface PromPushOptions extends ReadOpts {
  async?: boolean | string;
  fpLimit?: number;
  ttlDays?: number;
}

export class PromReader {
  query(query: string, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  queryRange(query: string, start: number, end: number, step: string, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  labels(opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  labelValues(labelName: string, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  series(match: string | string[], start: number, end: number, opts?: ReadOpts): Promise<QrynResponse<unknown>>;
  rules(opts?: ReadOpts): Promise<QrynResponse<unknown>>;
}

export class Prometheus {
  push(metrics: Metric[], options?: PromPushOptions): Promise<QrynResponse<unknown> | undefined>;
  createReader(options?: { orgId?: string }): PromReader;
}

// -- Tempo --

export interface SearchOpts {
  q: string;
  start?: Date | number;
  end?: Date | number;
  limit?: number;
  spss?: number;
}

export interface TempoSearchResponse {
  traces?: Array<{
    traceID: string;
    rootServiceName?: string;
    rootTraceName?: string;
    durationMs?: number;
    startTimeUnixNano?: string;
    spanCount?: number;
  }>;
}

export interface TraceResponse { batches: unknown[]; }

export class TempoClient {
  search(searchParams?: string | URLSearchParams | SearchOpts, options?: ReadOpts): Promise<QrynResponse<TempoSearchResponse>>;
  searchTags(scope?: 'span' | 'resource' | 'intrinsic', options?: ReadOpts): Promise<QrynResponse<{ tagNames?: string[] }>>;
  searchTagValues(tagName: string, options?: ReadOpts): Promise<QrynResponse<{ tagValues?: string[] }>>;
  searchTagValuesV2(tagName: string, searchParams?: string | URLSearchParams, options?: ReadOpts): Promise<QrynResponse<unknown>>;
  getTrace(traceId: string, options?: ReadOpts): Promise<QrynResponse<TraceResponse>>;
  getTraceSpansJson(traceId: string, options?: ReadOpts): Promise<QrynResponse<TraceResponse>>;
}

// -- Collector --

export interface CollectorOptions {
  maxBulkSize?: number;
  maxTimeout?: number;
}

export class Collector {
  pushStream(stream: Stream): void;
  pushMetric(metric: Metric): void;
  flush(): Promise<void>;
}

// -- Client --

export class QrynClient {
  constructor(config: QrynClientOptions);
  loki: Loki;
  prom: Prometheus;
  tempo: TempoClient;

  createCollector(config?: CollectorOptions): Collector;
  createStream(labels: Record<string, string>): Stream;
  createMetric(input: { name: string; labels?: Record<string, string> }): Metric;
}
