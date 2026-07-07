// Updated 2026-07-07
import { defineConfig } from "vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const vitePort = Number(env.VITE_PORT || 5173);
  const nodeRuntimeOrigin = env.VITE_NODE_RUNTIME_ORIGIN || "http://localhost:3000";
  const fastifyRuntimeOrigin = env.VITE_FASTIFY_RUNTIME_ORIGIN || "http://localhost:4001";
  const phpRuntimeOrigin = env.VITE_PHP_RUNTIME_ORIGIN || "http://localhost:8000";

  return {
    base: "/app/",
    plugins: [react()],
    server: {
      port: vitePort,
      proxy: {
        "/bridge/node": {
          target: nodeRuntimeOrigin,
          changeOrigin: true,
          rewrite: (inputPath) => inputPath.replace(/^\/bridge\/node/, "")
        },
        "/bridge/fastify": {
          target: fastifyRuntimeOrigin,
          changeOrigin: true,
          rewrite: (inputPath) => inputPath.replace(/^\/bridge\/fastify/, "")
        },
        "/bridge/php": {
          target: phpRuntimeOrigin,
          changeOrigin: true,
          rewrite: (inputPath) => inputPath.replace(/^\/bridge\/php/, "")
        }
      }
    }
  };
});

