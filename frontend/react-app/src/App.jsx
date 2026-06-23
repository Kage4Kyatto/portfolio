import { useEffect, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import StatusCard from "./components/StatusCard";

const ENDPOINTS = {
  fastifyHealth: import.meta.env.VITE_FASTIFY_HEALTH_PATH || "/bridge/fastify/health",
  nodeHealth: import.meta.env.VITE_NODE_HEALTH_PATH || "/bridge/node/api/health",
  phpHealth: import.meta.env.VITE_PHP_HEALTH_PATH || "/bridge/php/api/health.php"
};

const createInitialState = () => ({
  status: "idle",
  detail: "Not checked yet",
  lastError: null
});

function HealthChecker() {
  const [checks, setChecks] = useState({
    fastify: createInitialState(),
    node: createInitialState(),
    php: createInitialState()
  });
  const [checking, setChecking] = useState(false);
  const [appError, setAppError] = useState(null);

  const runCheck = async (endpoint) => {
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
          lastError: `Server returned ${response.status}`
        };
      }

      let parsed = null;
      try {
        parsed = bodyText ? JSON.parse(bodyText) : null;
      } catch (e) {
        return {
          status: "error",
          detail: "Invalid JSON response",
          lastError: e.message
        };
      }

      const serviceName = parsed?.service || parsed?.runtime || "healthy";
      return {
        status: "ok",
        detail: `${serviceName}`
      };
    } catch (error) {
      const errorDetail = error instanceof TypeError ? "connection refused" : "unreachable";
      return {
        status: "error",
        detail: errorDetail,
        lastError: error.message
      };
    }
  };

  const refresh = async () => {
    setChecking(true);
    try {
      const [fastify, node, php] = await Promise.all([
        runCheck(ENDPOINTS.fastifyHealth),
        runCheck(ENDPOINTS.nodeHealth),
        runCheck(ENDPOINTS.phpHealth)
      ]);
      setChecks({ fastify, node, php });
      setAppError(null);
    } catch (error) {
      setAppError(error.message);
      console.error("Health check error:", error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    refresh();
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

        <div className="grid">
          <StatusCard label="Fastify" value={checks.fastify} />
          <StatusCard label="Node Express" value={checks.node} />
          <StatusCard label="PHP API" value={checks.php} />
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
