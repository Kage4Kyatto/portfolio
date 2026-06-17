const fs = require("fs");
const path = require("path");
const { getNotificationQueue, saveNotificationQueue } = require("../data/storage");

const retryDelayMs = Number(process.env.NOTIFY_RETRY_DELAY_MS || 10000);
const maxAttempts = Number(process.env.NOTIFY_MAX_ATTEMPTS || 3);
const maxBackoffMs = Number(process.env.NOTIFY_MAX_BACKOFF_MS || 5 * 60 * 1000);
const deadLetterPath = path.join(__dirname, "..", "..", "php", "data", "notification_dead_letter.json");

const appendDeadLetter = (entry) => {
  let items = [];
  try {
    const file = fs.readFileSync(deadLetterPath, "utf8");
    const parsed = JSON.parse(file || "[]");
    items = Array.isArray(parsed) ? parsed : [];
  } catch {
    items = [];
  }

  items.push(entry);
  if (items.length > 500) {
    items = items.slice(items.length - 500);
  }

  fs.writeFileSync(deadLetterPath, JSON.stringify(items, null, 2));
};

const enqueueNotification = async (payload) => {
  const queue = await getNotificationQueue();
  queue.push({
    id: Date.now(),
    payload,
    attempts: 0,
    nextAttemptAt: Date.now()
  });
  await saveNotificationQueue(queue);
};

const processQueue = async () => {
  const now = Date.now();
  const queue = await getNotificationQueue();
  const pending = [];

  queue.forEach((job) => {
    if (job.nextAttemptAt > now) {
      pending.push(job);
      return;
    }

    const nextAttempts = Number(job.attempts || 0) + 1;

    if (nextAttempts >= maxAttempts) {
      appendDeadLetter({
        ...job,
        failedAt: new Date().toISOString(),
        reason: "Max retry attempts reached"
      });
      return;
    }

    const backoff = Math.min(maxBackoffMs, retryDelayMs * 2 ** Math.max(0, nextAttempts - 1));

    pending.push({
      ...job,
      attempts: nextAttempts,
      nextAttemptAt: now + backoff
    });
  });

  await saveNotificationQueue(pending);
};

const startNotificationWorker = () => {
  setInterval(() => {
    processQueue().catch(() => {});
  }, Math.max(3000, retryDelayMs)).unref();
};

module.exports = {
  enqueueNotification,
  startNotificationWorker
};
