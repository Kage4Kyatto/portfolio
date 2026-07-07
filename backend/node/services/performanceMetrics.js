// Updated 2026-07-07
const MAX_SAMPLES_PER_ROUTE = 200;
const MAX_TRACKED_ROUTES = 500;

const routeMetrics = new Map();

const normalizePath = (inputPath) => {
  const value = String(inputPath || "/").split("?")[0];
  return value.replace(/\/\d+/g, "/:id");
};

const percentile = (values, p) => {
  if (!Array.isArray(values) || values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
};

const recordRequest = (inputPath, statusCode, durationMs) => {
  const route = normalizePath(inputPath);
  const status = Number(statusCode || 0);
  const duration = Number.isFinite(Number(durationMs)) ? Number(durationMs) : 0;

  const existing = routeMetrics.get(route) || {
    samples: [],
    totalRequests: 0,
    totalErrors: 0,
    lastStatus: 0,
    lastDurationMs: 0,
    lastSeenAt: null
  };

  existing.totalRequests += 1;
  if (status >= 500) {
    existing.totalErrors += 1;
  }
  existing.lastStatus = status;
  existing.lastDurationMs = duration;
  existing.lastSeenAt = new Date().toISOString();

  existing.samples.push(duration);
  if (existing.samples.length > MAX_SAMPLES_PER_ROUTE) {
    existing.samples.splice(0, existing.samples.length - MAX_SAMPLES_PER_ROUTE);
  }

  routeMetrics.set(route, existing);

  if (routeMetrics.size > MAX_TRACKED_ROUTES) {
    let oldestRoute = null;
    let oldestSeenAt = Number.POSITIVE_INFINITY;

    for (const [currentRoute, metrics] of routeMetrics.entries()) {
      const seenAt = Date.parse(String(metrics.lastSeenAt || ""));
      const normalizedSeenAt = Number.isFinite(seenAt) ? seenAt : 0;
      if (normalizedSeenAt < oldestSeenAt) {
        oldestSeenAt = normalizedSeenAt;
        oldestRoute = currentRoute;
      }
    }

    if (oldestRoute) {
      routeMetrics.delete(oldestRoute);
    }
  }
};

const getPerformanceSummary = () => {
  const routes = [];

  for (const [route, metrics] of routeMetrics.entries()) {
    const sampleCount = metrics.samples.length;
    const p50 = Math.round(percentile(metrics.samples, 50));
    const p95 = Math.round(percentile(metrics.samples, 95));
    const errorRate = metrics.totalRequests > 0
      ? Number((metrics.totalErrors / metrics.totalRequests).toFixed(4))
      : 0;

    routes.push({
      route,
      sampleCount,
      totalRequests: metrics.totalRequests,
      totalErrors: metrics.totalErrors,
      errorRate,
      p50Ms: p50,
      p95Ms: p95,
      lastStatus: metrics.lastStatus,
      lastDurationMs: Math.round(metrics.lastDurationMs),
      lastSeenAt: metrics.lastSeenAt
    });
  }

  routes.sort((a, b) => b.totalRequests - a.totalRequests);

  return {
    generatedAt: new Date().toISOString(),
    routes
  };
};

module.exports = {
  recordRequest,
  getPerformanceSummary
};

