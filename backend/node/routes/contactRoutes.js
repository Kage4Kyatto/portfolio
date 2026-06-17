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

router.get("/admin/session", requireCloudflareAccess, (req, res) => {
	res.status(200).json({
		success: true,
		...getAdminSessionState(req)
	});
});

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

router.get("/health", getHealth);
router.get("/messages", requireCloudflareAccess, adminLimiter, requireAdminSessionOrBasic, getMessages);
router.post("/contact", contactLimiter, submitContact);

module.exports = router;
