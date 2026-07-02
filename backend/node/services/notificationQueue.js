const fs = require("fs");
const path = require("path");
const { getNotificationQueue, saveNotificationQueue } = require("../data/storage");

const retryDelayMs = Number(process.env.NOTIFY_RETRY_DELAY_MS || 10000);
const maxAttempts = Number(process.env.NOTIFY_MAX_ATTEMPTS || 3);
const maxBackoffMs = Number(process.env.NOTIFY_MAX_BACKOFF_MS || 5 * 60 * 1000);
const deadLetterPath = path.join(__dirname, "..", "..", "php", "data", "notification_dead_letter.json");

// Queue health metrics
let queueMetrics = {
  totalProcessed: 0,
  totalFailed: 0,
  lastProcessedAt: null,
  lastErrorAt: null,
  lastErrorMessage: null,
  isProcessing: false,
  lastStartedAt: null
};
let inFlightProcessPromise = null;
let workerInterval = null;
let workerPaused = false;

const appendDeadLetter = async (entry) => {
  try {
    let items = [];
    try {
      const file = await fs.promises.readFile(deadLetterPath, "utf8");
      const parsed = JSON.parse(file || "[]");
      items = Array.isArray(parsed) ? parsed : [];
    } catch {
      items = [];
    }

    items.push(entry);
    // Keep last 1000 entries per day for better debugging
    if (items.length > 1000) {
      items = items.slice(items.length - 1000);
    }

    await fs.promises.writeFile(deadLetterPath, JSON.stringify(items, null, 2));
  } catch (error) {
    console.error("[DeadLetter] Failed to append entry:", error);
  }
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
  if (workerPaused) {
    return;
  }

  if (inFlightProcessPromise) {
    return inFlightProcessPromise;
  }

  inFlightProcessPromise = (async () => {
    queueMetrics.isProcessing = true;
    queueMetrics.lastStartedAt = new Date().toISOString();

  try {
    const now = Date.now();
    const queue = await getNotificationQueue();
    const pending = [];

    for (const job of queue) {
      if (job.nextAttemptAt > now) {
        pending.push(job);
        continue;
      }

      const nextAttempts = Number(job.attempts || 0) + 1;

      if (nextAttempts >= maxAttempts) {
        queueMetrics.totalFailed++;
        await appendDeadLetter({
          ...job,
          failedAt: new Date().toISOString(),
          reason: "Max retry attempts reached"
        });
        continue;
      }

      // Add exponential backoff with jitter to prevent thundering herd
      const baseBackoff = Math.min(maxBackoffMs, retryDelayMs * 2 ** Math.max(0, nextAttempts - 1));
      const jitter = Math.random() * 0.1 * baseBackoff; // ±5% jitter
      const backoff = baseBackoff + jitter;

      pending.push({
        ...job,
        attempts: nextAttempts,
        nextAttemptAt: now + backoff
      });
    }

    await saveNotificationQueue(pending);
    queueMetrics.totalProcessed++;
    queueMetrics.lastProcessedAt = new Date().toISOString();
  } catch (error) {
    queueMetrics.lastErrorAt = new Date().toISOString();
    queueMetrics.lastErrorMessage = error?.message || "Unknown error";
    console.error("[NotificationQueue] Error processing queue:", error);
  } finally {
    queueMetrics.isProcessing = false;
    inFlightProcessPromise = null;
  }
  })();

  return inFlightProcessPromise;
};

const getQueueMetrics = () => {
  return { ...queueMetrics };
};

const getQueueSnapshot = async () => {
  const queue = await getNotificationQueue();
  const now = Date.now();
  const dueNow = queue.filter((job) => Number(job.nextAttemptAt || 0) <= now).length;
  const oldestNextAttemptAt = queue.length > 0
    ? Math.min(...queue.map((job) => Number(job.nextAttemptAt || now)))
    : null;

  return {
    queueDepth: queue.length,
    dueNow,
    oldestNextAttemptAt,
    workerPaused,
    ...getQueueMetrics()
  };
};

const processQueueNow = async () => {
  await processQueue();
  return getQueueSnapshot();
};

const startNotificationWorker = () => {
  if (workerInterval) {
    return;
  }

  workerInterval = setInterval(() => {
    processQueue().catch((error) => {
      console.error("[NotificationQueue] Unhandled error in worker:", error);
    });
  }, Math.max(3000, retryDelayMs));
  
  workerInterval.unref();
};

const pauseNotificationWorker = () => {
  workerPaused = true;
};

const resumeNotificationWorker = () => {
  workerPaused = false;
};

const clearNotificationQueue = async () => {
  await saveNotificationQueue([]);
};

module.exports = {
  enqueueNotification,
  startNotificationWorker,
  pauseNotificationWorker,
  resumeNotificationWorker,
  clearNotificationQueue,
  getQueueMetrics,
  getQueueSnapshot,
  processQueueNow
};
