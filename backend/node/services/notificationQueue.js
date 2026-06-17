const fs = require("fs");
const path = require("path");

const queuePath = path.join(__dirname, "..", "..", "php", "data", "notification_queue.json");
const retryDelayMs = Number(process.env.NOTIFY_RETRY_DELAY_MS || 10000);
const maxAttempts = Number(process.env.NOTIFY_MAX_ATTEMPTS || 3);

const readQueue = () => {
  try {
    const raw = fs.readFileSync(queuePath, "utf8");
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeQueue = (items) => {
  fs.writeFileSync(queuePath, JSON.stringify(items, null, 2));
};

const enqueueNotification = (payload) => {
  const queue = readQueue();
  queue.push({
    id: Date.now(),
    payload,
    attempts: 0,
    nextAttemptAt: Date.now()
  });
  writeQueue(queue);
};

const processQueue = () => {
  const now = Date.now();
  const queue = readQueue();
  const pending = [];

  queue.forEach((job) => {
    if (job.nextAttemptAt > now) {
      pending.push(job);
      return;
    }

    const nextAttempts = Number(job.attempts || 0) + 1;

    if (nextAttempts >= maxAttempts) {
      return;
    }

    pending.push({
      ...job,
      attempts: nextAttempts,
      nextAttemptAt: now + retryDelayMs
    });
  });

  writeQueue(pending);
};

const startNotificationWorker = () => {
  setInterval(processQueue, Math.max(3000, retryDelayMs)).unref();
};

module.exports = {
  enqueueNotification,
  startNotificationWorker
};
