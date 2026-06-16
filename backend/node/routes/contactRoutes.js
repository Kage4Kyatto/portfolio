const express = require("express");
const { getHealth, submitContact, getMessages } = require("../controllers/contactController");
const { requireAdminAuth } = require("../middleware/authMiddleware");
const { requireCloudflareAccess } = require("../middleware/cloudflareAccessMiddleware");

const router = express.Router();

router.get("/health", getHealth);
router.get("/messages", requireCloudflareAccess, requireAdminAuth, getMessages);
router.post("/contact", submitContact);

module.exports = router;
