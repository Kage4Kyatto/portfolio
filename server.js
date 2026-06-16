const express = require("express");
const fs = require("fs");
const path = require("path");

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const file = fs.readFileSync(filePath, "utf8");
  const lines = file.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!Object.prototype.hasOwnProperty.call(process.env, key) || !process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(__dirname, ".env.local"));

const contactRoutes = require("./backend/node/routes/contactRoutes");
const { requireCloudflareAccess } = require("./backend/node/middleware/cloudflareAccessMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", contactRoutes);

app.get("/admin", requireCloudflareAccess, (req, res) => {
  res.redirect("/admin.html");
});

app.get("/admin.html", requireCloudflareAccess, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Portfolio server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
