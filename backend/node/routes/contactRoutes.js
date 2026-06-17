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

const router = express.Router();

router.get("/admin/session", requireCloudflareAccess, (req, res) => {
	res.status(200).json({
		success: true,
		...getAdminSessionState(req)
	});
});

router.post("/admin/login", requireCloudflareAccess, requireAdminAuth, (req, res) => {
	const csrfToken = startAdminSession(req);
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

router.post("/admin/logout", requireCloudflareAccess, requireAdminSession, requireCsrfToken, (req, res) => {
	endAdminSession(req, () => {
		res.status(200).json({
			success: true,
			message: "Session closed."
		});
	});
});

router.get("/admin/metrics", requireCloudflareAccess, requireAdminSession, async (req, res) => {
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
router.get("/messages", requireCloudflareAccess, requireAdminSessionOrBasic, getMessages);
router.post("/contact", submitContact);

module.exports = router;
