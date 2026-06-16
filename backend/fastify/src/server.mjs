import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({ logger: true });
const port = Number(process.env.FASTIFY_PORT || 4001);

await app.register(cors, {
  origin: true
});

app.get("/health", async () => {
  return {
    ok: true,
    service: "portfolio-fastify",
    timestamp: new Date().toISOString()
  };
});

app.post("/contact", async (request, reply) => {
  const { name, email, message } = request.body || {};

  if (!name || !email || !message) {
    reply.code(400);
    return {
      ok: false,
      error: "name, email, and message are required"
    };
  }

  return {
    ok: true,
    message: "Fastify contact endpoint received payload",
    data: { name, email }
  };
});

try {
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`Fastify service listening on http://localhost:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
