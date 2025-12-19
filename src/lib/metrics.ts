export type MetricsSnapshot = {
  requests: number;
  avgDurationMs: number;
  byStatus: Record<string, number>;
};

export type MetricsSink = {
  increment: (
    name: string,
    value?: number,
    labels?: Record<string, string>,
  ) => void;
  observe: (
    name: string,
    value: number,
    labels?: Record<string, string>,
  ) => void;
  snapshot: () => MetricsSnapshot;
};

class NullMetrics implements MetricsSink {
  increment() {}
  observe() {}
  snapshot(): MetricsSnapshot {
    return { requests: 0, avgDurationMs: 0, byStatus: {} };
  }
}

class InMemoryMetrics implements MetricsSink {
  private requestCount = 0;
  private totalDurationMs = 0;
  private byStatus = new Map<string, number>();

  increment(
    name: string,
    value = 1,
    labels?: Record<string, string>,
  ) {
    if (name !== "requests_total") return;
    this.requestCount += value;
    const status = labels?.status ?? "unknown";
    this.byStatus.set(status, (this.byStatus.get(status) ?? 0) + value);
  }

  observe(name: string, value: number) {
    if (name !== "request_duration_ms") return;
    this.totalDurationMs += value;
  }

  snapshot(): MetricsSnapshot {
    const avgDurationMs = this.requestCount
      ? Number((this.totalDurationMs / this.requestCount).toFixed(2))
      : 0;
    return {
      requests: this.requestCount,
      avgDurationMs,
      byStatus: Object.fromEntries(this.byStatus.entries()),
    };
  }
}

let sink: MetricsSink = new NullMetrics();

export const createInMemoryMetrics = (): MetricsSink => new InMemoryMetrics();

export const setMetricsSink = (next: MetricsSink) => {
  sink = next;
};

export const recordRequest = (durationMs: number, status: number) => {
  sink.increment("requests_total", 1, { status: String(status) });
  sink.observe("request_duration_ms", durationMs);
};

export const getMetricsSnapshot = () => sink.snapshot();
