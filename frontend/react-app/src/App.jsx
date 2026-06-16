import { useEffect, useState } from "react";

const ENDPOINTS = {
  fastifyHealth: import.meta.env.VITE_FASTIFY_HEALTH_PATH || "/bridge/fastify/health",
  nodeHealth: import.meta.env.VITE_NODE_HEALTH_PATH || "/bridge/node/api/health",
  phpHealth: import.meta.env.VITE_PHP_HEALTH_PATH || "/bridge/php/api/health.php"
};

const createInitialState = () => ({
  status: "idle",
  detail: "Not checked yet"
});

export default function App() {
  const [checks, setChecks] = useState({
    fastify: createInitialState(),
    node: createInitialState(),
    php: createInitialState()
  });
  const [checking, setChecking] = useState(false);

  const runCheck = async (endpoint) => {
    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      const bodyText = await response.text();

      if (!response.ok) {
        return {
          status: "error",
          detail: `HTTP ${response.status}`
        };
      }

      let parsed = null;
      try {
        parsed = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        parsed = null;
      }

      const serviceName = parsed?.service || parsed?.runtime || "healthy";
      return {
        status: "ok",
        detail: `${serviceName}`
      };
    } catch {
      return {
        status: "error",
        detail: "unreachable"
      };
    }
  };

  const refresh = async () => {
    setChecking(true);
    const [fastify, node, php] = await Promise.all([
      runCheck(ENDPOINTS.fastifyHealth),
      runCheck(ENDPOINTS.nodeHealth),
      runCheck(ENDPOINTS.phpHealth)
    ]);
    setChecks({ fastify, node, php });
    setChecking(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="app-shell">
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

        <button className="refresh-button" type="button" onClick={refresh} disabled={checking}>
          {checking ? "Checking..." : "Refresh Checks"}
        </button>
      </section>
    </main>
  );
}

function StatusCard({ label, value }) {
  return (
    <article className="status-card">
      <h2>{label}</h2>
      <p className={`status status-${value.status}`}>{value.status.toUpperCase()}</p>
      <p className="detail">{value.detail}</p>
    </article>
  );
}
