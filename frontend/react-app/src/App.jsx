import { useEffect, useRef, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import StatusCard from "./components/StatusCard";

const ENDPOINTS = {
  fastifyHealth: import.meta.env.VITE_FASTIFY_HEALTH_PATH || "/bridge/fastify/health",
  nodeHealth: import.meta.env.VITE_NODE_HEALTH_PATH || "/bridge/node/api/health",
  phpHealth: import.meta.env.VITE_PHP_HEALTH_PATH || "/bridge/php/api/health.php"
};
const AUTO_REFRESH_MS = 15000;
const MAX_HISTORY = 30;

const createInitialState = () => ({
  status: "idle",
  detail: "Not checked yet",
  lastError: null
});

const createLatencyHistory = () => ({
  fastify: [],
  node: [],
  php: []
});

const computeP50 = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor((sorted.length - 1) / 2);
  return sorted[mid];
};

function HealthChecker() {
  const [checks, setChecks] = useState({
    fastify: createInitialState(),
    node: createInitialState(),
    php: createInitialState()
  });
  const [checking, setChecking] = useState(false);
  const [appError, setAppError] = useState(null);
  const [lastCheckedAt, setLastCheckedAt] = useState(null);
  const [appVersion, setAppVersion] = useState("-");
  const [latencyHistory, setLatencyHistory] = useState(createLatencyHistory());
  const isRefreshingRef = useRef(false);

  const runCheck = async (endpoint) => {
    const startedAt = performance.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const bodyText = await response.text();

      if (!response.ok) {
        return {
          status: "error",
          detail: `HTTP ${response.status}`,
          lastError: `Server returned ${response.status}`,
          durationMs: Math.round(performance.now() - startedAt)
        };
      }

      let parsed = null;
      try {
        parsed = bodyText ? JSON.parse(bodyText) : null;
      } catch (e) {
        return {
          status: "error",
          detail: "Invalid JSON response",
          lastError: e.message,
          durationMs: Math.round(performance.now() - startedAt)
        };
      }

      const serviceName = parsed?.service || parsed?.runtime || "healthy";
      return {
        status: "ok",
        detail: `${serviceName}`,
        durationMs: Math.round(performance.now() - startedAt)
      };
    } catch (error) {
      const errorDetail = error instanceof TypeError ? "connection refused" : "unreachable";
      return {
        status: "error",
        detail: errorDetail,
        lastError: error.message,
        durationMs: Math.round(performance.now() - startedAt)
      };
    }
  };

  const refresh = async () => {
    if (isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;
    setChecking(true);
    try {
      const [fastify, node, php] = await Promise.all([
        runCheck(ENDPOINTS.fastifyHealth),
        runCheck(ENDPOINTS.nodeHealth),
        runCheck(ENDPOINTS.phpHealth)
      ]);

      setLatencyHistory((previous) => {
        const next = {
          fastify: [...previous.fastify, fastify.durationMs].slice(-MAX_HISTORY),
          node: [...previous.node, node.durationMs].slice(-MAX_HISTORY),
          php: [...previous.php, php.durationMs].slice(-MAX_HISTORY)
        };
        return next;
      });

      setChecks({ fastify, node, php });
      setLastCheckedAt(new Date().toISOString());
      setAppError(null);
    } catch (error) {
      setAppError(error.message);
      console.error("Health check error:", error);
    } finally {
      setChecking(false);
      isRefreshingRef.current = false;
    }
  };

  useEffect(() => {
    fetch("/bridge/node/api/version", { headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.version) {
          setAppVersion(payload.version);
        }
      })
      .catch(() => {});

    refresh();
    const interval = setInterval(() => {
      refresh();
    }, AUTO_REFRESH_MS);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <main className="app-shell">
      {appError && (
        <div className="alert alert-error" role="alert">
          <strong>Error:</strong> {appError}
          <button onClick={() => setAppError(null)} aria-label="Close error">×</button>
        </div>
      )}
      <section className="card">
        <p className="eyebrow">React Admin Dashboard</p>
        <h1>Framework Health Overview</h1>
        <p>
          This route is mounted under /app and gives you a React-powered overview of Fastify, Node,
          and PHP runtime health.
        </p>
        <p>
          {lastCheckedAt ? `Last checked: ${new Date(lastCheckedAt).toLocaleString()}` : "Waiting for first successful check..."}
        </p>
        <p>Version: {appVersion}</p>

        <div className="grid">
          <StatusCard label="Fastify" value={checks.fastify} />
          <StatusCard label="Node Express" value={checks.node} />
          <StatusCard label="PHP API" value={checks.php} />
        </div>

        <div className="trend-grid">
          <article className="trend-card">
            <h2>Fastify Latency</h2>
            <p className="trend-value">{computeP50(latencyHistory.fastify) ?? "-"} ms p50</p>
            <p className="trend-detail">Samples: {latencyHistory.fastify.length}</p>
          </article>
          <article className="trend-card">
            <h2>Node Latency</h2>
            <p className="trend-value">{computeP50(latencyHistory.node) ?? "-"} ms p50</p>
            <p className="trend-detail">Samples: {latencyHistory.node.length}</p>
          </article>
          <article className="trend-card">
            <h2>PHP Latency</h2>
            <p className="trend-value">{computeP50(latencyHistory.php) ?? "-"} ms p50</p>
            <p className="trend-detail">Samples: {latencyHistory.php.length}</p>
          </article>
        </div>

        <button 
          className="refresh-button" 
          type="button" 
          onClick={refresh} 
          disabled={checking}
          aria-busy={checking}
        >
          {checking ? "Checking..." : "Refresh Checks"}
        </button>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <HealthChecker />
    </ErrorBoundary>
  );
}
