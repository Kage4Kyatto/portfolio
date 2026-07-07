// Updated 2026-07-07
const express = require("express");
const { getHealth, submitContact, getMessages: getMessagesHandler } = require("../controllers/contactController");
const {
	requireAdminAuth,
	requireAdminSession,
	requireAdminSessionOrBasic,
	requireCsrfToken,
	startAdminSession,
	endAdminSession,
	getAdminSessionState
} = require("../middleware/authMiddleware");
const { requireCloudflareAccess } = require("../middleware/cloudflareAccessMiddleware");
const {
	getSystemMetrics,
	getMessages: getStoredMessages,
	getTelemetryEvents,
	appendTelemetryEvent,
	getStorageStatus
} = require("../data/storage");
const {
	getQueueSnapshot,
	processQueueNow,
	pauseNotificationWorker,
	resumeNotificationWorker,
	clearNotificationQueue
} = require("../services/notificationQueue");
const { getSummary } = require("../services/reportSummary");
const { getPerformanceSummary } = require("../services/performanceMetrics");
const { adminLimiter, authLimiter } = require("../utils/rateLimiter");

const router = express.Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     tags:
 *       - Health
 *     summary: Get API health status
 *     description: Returns service status and notification system info
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 notificationMode:
 *                   type: string
 *                   enum: [queue, webhook, disabled]
 */
router.get("/health", getHealth);

/**
 * @swagger
 * /api/admin/session:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get admin session state
 *     description: Check if user is authenticated and get session info
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Session state retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminSession'
 */
router.get("/admin/session", requireCloudflareAccess, (req, res) => {
	res.status(200).json({
		success: true,
		...getAdminSessionState(req)
	});
});

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Login to admin dashboard
 *     description: Authenticate with username and password, receive CSRF token and optional OTP prompt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *               otp:
 *                 type: string
 *                 description: One-time password if 2FA is enabled
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             schema:
 *               type: string
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
router.post("/admin/login", requireCloudflareAccess, authLimiter, requireAdminAuth, (req, res) => {
	const csrfToken = startAdminSession(req);
	if (!csrfToken) {
		return res.status(500).json({
			success: false,
			message: "Failed to create session."
		});
	}

	appendTelemetryEvent({
		event: "admin_login",
		path: req.originalUrl,
		locale: "en",
		timestamp: new Date().toISOString()
	}).catch(() => {});

	return res.status(200).json({
		success: true,
		message: "Admin session started.",
		csrfToken
	});
});

/**
 * @swagger
 * /api/admin/logout:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Logout from admin dashboard
 *     description: End admin session and invalidate CSRF token
 *     security:
 *       - sessionAuth: []
 *       - csrfToken: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/admin/logout", requireCloudflareAccess, adminLimiter, requireCsrfToken, requireAdminSession, (req, res) => {
	endAdminSession(req, (error) => {
		if (error) {
			console.error("Failed to destroy admin session:", error);
			appendTelemetryEvent({
				event: "admin_logout_error",
				path: req.originalUrl,
				locale: "en",
				timestamp: new Date().toISOString()
			}).catch(() => {});
			return res.status(500).json({
				success: false,
				message: "Failed to log out."
			});
		}

		appendTelemetryEvent({
			event: "admin_logout",
			path: req.originalUrl,
			locale: "en",
			timestamp: new Date().toISOString()
		}).catch(() => {});

		return res.status(200).json({
			success: true,
			message: "Logged out."
		});
	});
});

router.get("/admin/audit-events", requireCloudflareAccess, adminLimiter, requireAdminSession, async (req, res) => {
	try {
		const requestedLimit = Number.parseInt(String(req.query.limit || "50"), 10);
		const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 50, 1), 200);
		const events = await getTelemetryEvents(limit);

		res.status(200).json({
			success: true,
			events
		});
	} catch (error) {
		console.error("Failed to load audit events:", error);
		res.status(500).json({
			success: false,
			message: "Failed to load audit events."
		});
	}
});

/**
 * @swagger
 * /api/admin/metrics:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get system metrics
 *     description: Retrieve dashboard metrics including message counts and system status
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Metrics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 metrics:
 *                   type: object
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: Too many requests
 */
router.get("/admin/metrics", requireCloudflareAccess, adminLimiter, requireAdminSession, async (req, res) => {
	try {
		const metrics = await getSystemMetrics();
		const storage = await getStorageStatus();
		res.status(200).json({
			success: true,
			metrics,
			storage
		});
	} catch (error) {
		console.error("Failed to load metrics:", error);
		res.status(500).json({
			success: false,
			message: "Failed to load metrics."
		});
	}
});

router.get("/admin/performance", requireCloudflareAccess, adminLimiter, requireAdminSession, (req, res) => {
	const performance = getPerformanceSummary();
	res.status(200).json({
		success: true,
		performance
	});
});

router.get("/admin/storage-status", requireCloudflareAccess, adminLimiter, requireAdminSession, async (req, res) => {
	try {
		const storage = await getStorageStatus();
		res.status(200).json({
			success: true,
			storage
		});
	} catch (error) {
		console.error("Failed to load storage status:", error);
		res.status(500).json({
			success: false,
			message: "Failed to load storage status."
		});
	}
});

router.get("/admin/queue", requireCloudflareAccess, adminLimiter, requireAdminSession, async (req, res) => {
	try {
		const queue = await getQueueSnapshot();
		res.status(200).json({
			success: true,
			queue
		});
	} catch (error) {
		console.error("Failed to load queue metrics:", error);
		res.status(500).json({
			success: false,
			message: "Failed to load queue metrics."
		});
	}
});

router.post("/admin/queue/process", requireCloudflareAccess, adminLimiter, requireCsrfToken, requireAdminSession, async (req, res) => {
	try {
		const queue = await processQueueNow();
		appendTelemetryEvent({
			event: "admin_queue_process",
			path: req.originalUrl,
			locale: "en",
			timestamp: new Date().toISOString()
		}).catch(() => {});
		res.status(200).json({
			success: true,
			message: "Queue processed.",
			queue
		});
	} catch (error) {
		console.error("Failed to process queue:", error);
		res.status(500).json({
			success: false,
			message: "Failed to process queue."
		});
	}
});

router.post("/admin/queue/pause", requireCloudflareAccess, adminLimiter, requireCsrfToken, requireAdminSession, async (req, res) => {
	try {
		pauseNotificationWorker();
		appendTelemetryEvent({
			event: "admin_queue_pause",
			path: req.originalUrl,
			locale: "en",
			timestamp: new Date().toISOString()
		}).catch(() => {});

		const queue = await getQueueSnapshot();
		res.status(200).json({
			success: true,
			message: "Queue worker paused.",
			queue
		});
	} catch (error) {
		console.error("Failed to pause queue worker:", error);
		res.status(500).json({
			success: false,
			message: "Failed to pause queue worker."
		});
	}
});

router.post("/admin/queue/resume", requireCloudflareAccess, adminLimiter, requireCsrfToken, requireAdminSession, async (req, res) => {
	try {
		resumeNotificationWorker();
		appendTelemetryEvent({
			event: "admin_queue_resume",
			path: req.originalUrl,
			locale: "en",
			timestamp: new Date().toISOString()
		}).catch(() => {});

		const queue = await getQueueSnapshot();
		res.status(200).json({
			success: true,
			message: "Queue worker resumed.",
			queue
		});
	} catch (error) {
		console.error("Failed to resume queue worker:", error);
		res.status(500).json({
			success: false,
			message: "Failed to resume queue worker."
		});
	}
});

router.post("/admin/queue/clear", requireCloudflareAccess, adminLimiter, requireCsrfToken, requireAdminSession, async (req, res) => {
	try {
		await clearNotificationQueue();
		appendTelemetryEvent({
			event: "admin_queue_clear",
			path: req.originalUrl,
			locale: "en",
			timestamp: new Date().toISOString()
		}).catch(() => {});

		const queue = await getQueueSnapshot();
		res.status(200).json({
			success: true,
			message: "Queue cleared.",
			queue
		});
	} catch (error) {
		console.error("Failed to clear queue:", error);
		res.status(500).json({
			success: false,
			message: "Failed to clear queue."
		});
	}
});

router.get("/admin/report-summary", requireCloudflareAccess, adminLimiter, requireAdminSession, async (req, res) => {
	try {
		const requestedEngine = req.query.engine || "auto";
		const allowedEngines = ["auto", "js", "go", "rust"];
		if (!allowedEngines.includes(requestedEngine)) {
			return res.status(400).json({
				success: false,
				message: "Invalid summary engine."
			});
		}

		const summary = await getSummary(requestedEngine);
		appendTelemetryEvent({
			event: "admin_summary_load",
			path: req.originalUrl,
			locale: "en",
			timestamp: new Date().toISOString()
		}).catch(() => {});

		res.status(200).json({
			success: true,
			summary
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: error.message || "Failed to load report summary."
		});
	}
});

/**
 * @swagger
 * /api/admin/analytics:
 *   get:
 *     tags:
 *       - Admin
 *     summary: Get detailed analytics
 *     description: Retrieve advanced analytics including trends, filters, and aggregated data
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - name: range
 *         in: query
 *         schema:
 *           type: string
 *           enum: [24h, 7d, 30d, all]
 *           default: 30d
 *       - name: filter
 *         in: query
 *         schema:
 *           type: string
 *           enum: [unread]
 *           description: Optional filter. Use `unread` to return only unread messages.
 *     responses:
 *       200:
 *         description: Analytics data retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 analytics:
 *                   type: object
 *       401:
 *         description: Not authenticated
 */
router.get("/admin/analytics", requireCloudflareAccess, adminLimiter, requireAdminSession, async (req, res) => {
	try {
		const messages = await getStoredMessages();
		const range = req.query.range || "30d";
		const filter = req.query.filter || null;
		const validRanges = ["24h", "7d", "30d", "all"];
		const validFilters = [null, "", "unread"];

		if (!validRanges.includes(range)) {
			return res.status(400).json({
				success: false,
				message: "Invalid range parameter."
			});
		}

		if (!validFilters.includes(filter)) {
			return res.status(400).json({
				success: false,
				message: "Invalid filter parameter."
			});
		}

		const now = Date.now();
		const ranges = {
			"24h": 24 * 60 * 60 * 1000,
			"7d": 7 * 24 * 60 * 60 * 1000,
			"30d": 30 * 24 * 60 * 60 * 1000,
			"all": Infinity
		};
		const timeRange = ranges[range] || ranges["30d"];
		const cutoffTime = now - timeRange;

		const toTimestamp = (msg) => {
			const raw = msg.createdAt || msg.timestamp;
			const parsed = new Date(raw).getTime();
			return Number.isFinite(parsed) ? parsed : null;
		};

		const isUnread = (msg) => msg.read === false || msg.status === "unread";

		let filteredMessages = (messages || []).filter((msg) => {
			const timestamp = toTimestamp(msg);
			return timestamp !== null && timestamp >= cutoffTime;
		});

		if (filter === "unread") {
			filteredMessages = filteredMessages.filter(isUnread);
		}

		const dailyTotals = {};
		filteredMessages.forEach((msg) => {
			const timestamp = toTimestamp(msg);
			if (timestamp === null) {
				return;
			}

			const date = new Date(timestamp).toISOString().split("T")[0];
			dailyTotals[date] = (dailyTotals[date] || 0) + 1;
		});

		const sourceBreakdown = {};
		filteredMessages.forEach((msg) => {
			const source = msg.referrer || msg.source || "direct";
			sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
		});

		const daysInRange = (() => {
			if (filteredMessages.length === 0) {
				return 1;
			}

			if (Number.isFinite(timeRange)) {
				return Math.max(1, Math.ceil(timeRange / (24 * 60 * 60 * 1000)));
			}

			const timestamps = filteredMessages
				.map((msg) => toTimestamp(msg))
				.filter((value) => Number.isFinite(value));

			if (timestamps.length === 0) {
				return 1;
			}

			const oldestTimestamp = Math.min(...timestamps);
			const newestTimestamp = Math.max(...timestamps, now);
			return Math.max(1, Math.ceil((newestTimestamp - oldestTimestamp) / (24 * 60 * 60 * 1000)) + 1);
		})();

		res.status(200).json({
			success: true,
			analytics: {
				total: filteredMessages.length,
				unread: filteredMessages.filter(isUnread).length,
				timeRange: range,
				dailyTotals,
				sourceBreakdown,
				avgMessagesPerDay: (filteredMessages.length / daysInRange).toFixed(1)
			}
		});
	} catch (error) {
		console.error("Failed to load analytics:", error);
		res.status(500).json({
			success: false,
			message: "Failed to load analytics."
		});
	}
});

/**
 * @swagger
 * /api/contact:
 *   post:
 *     tags:
 *       - Contact
 *     summary: Submit contact form
 *     description: Submit a contact message with name, email, subject, and message. Rate limits apply per IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContactMessage'
 *     responses:
 *       201:
 *         description: Message submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid or missing required fields
 *       429:
 *         description: Rate limit exceeded
 */
router.post("/contact", submitContact);

/**
 * @swagger
 * /api/messages:
 *   get:
 *     tags:
 *       - Messages
 *     summary: Get all contact messages
 *     description: Retrieve paginated contact messages. Requires admin authentication.
 *     security:
 *       - sessionAuth: []
 *     parameters:
 *       - name: page
 *         in: query
 *         schema:
 *           type: integer
 *           default: 1
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 messages:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Not authenticated
 *       429:
 *         description: Too many requests
 */
router.get("/messages", requireCloudflareAccess, adminLimiter, requireAdminSessionOrBasic, getMessagesHandler);

module.exports = router;

