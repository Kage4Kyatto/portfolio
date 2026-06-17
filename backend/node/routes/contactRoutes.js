const express = require("express");
const { getHealth, submitContact, getMessages } = require("../controllers/contactController");
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
const { getSystemMetrics } = require("../data/storage");
const { contactLimiter, adminLimiter, authLimiter } = require("../utils/rateLimiter");

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
router.post("/admin/login", requireCloudflareAccess, authLimiter, requireAdminAuth, (req, res) => {	const csrfToken = startAdminSession(req);
	if (!csrfToken) {
		return res.status(500).json({
			success: false,
			message: "Failed to create session."
		});
	}

	return res.status(200).json({
		success: true,
		message: "Admin session started.",
		csrfToken
	});
});

router.post("/admin/logout", requireCloudflareAccess, adminLimiter, requireAdminSession, requireCsrfToken, (req, res) => {
	endAdminSession(req, () => {
		res.status(200).json({
			success: true,
			message: "Session closed."
		});
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
router.post("/admin/logout", requireCloudflareAccess, requireCsrfToken, requireAdminSession, (req, res) => {
	endAdminSession(req);
	res.status(200).json({
		success: true,
		message: "Logged out."
	});
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
		res.status(200).json({
			success: true,
			metrics
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			message: "Failed to load metrics."
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
 *           description: Filter by status (read/unread) or category
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
		const metrics = await getSystemMetrics();
		const range = req.query.range || "30d";
		const filter = req.query.filter || null;

		const now = Date.now();
		const ranges = {
			"24h": 24 * 60 * 60 * 1000,
			"7d": 7 * 24 * 60 * 60 * 1000,
			"30d": 30 * 24 * 60 * 60 * 1000,
			"all": Infinity
		};
		const timeRange = ranges[range] || ranges["30d"];
		const cutoffTime = now - timeRange;

		const filteredMessages = (metrics.messages || []).filter(msg => 
			new Date(msg.timestamp).getTime() >= cutoffTime
		);

		if (filter === "unread") {
			filteredMessages = filteredMessages.filter(msg => !msg.read);
		}

		const dailyTotals = {};
		filteredMessages.forEach(msg => {
			const date = new Date(msg.timestamp).toISOString().split("T")[0];
			dailyTotals[date] = (dailyTotals[date] || 0) + 1;
		});

		const sourceBreakdown = {};
		filteredMessages.forEach(msg => {
			const source = msg.referrer || "direct";
			sourceBreakdown[source] = (sourceBreakdown[source] || 0) + 1;
		});

		res.status(200).json({
			success: true,
			analytics: {
				total: filteredMessages.length,
				unread: filteredMessages.filter(m => !m.read).length,
				timeRange: range,
				dailyTotals,
				sourceBreakdown,
				avgMessagesPerDay: (filteredMessages.length / Math.ceil(timeRange / (24 * 60 * 60 * 1000))).toFixed(1)
			}
		});
	} catch (error) {
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
 *     description: Submit a contact message with name, email, subject, and message. Max 5 submissions per hour per IP.
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
router.post("/contact", contactLimiter, submitContact);

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
router.get("/messages", requireCloudflareAccess, adminLimiter, requireAdminSessionOrBasic, getMessages);

module.exports = router;
