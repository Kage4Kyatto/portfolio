const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "backend", "php", "data");
const filesToReset = [
  {
    fileName: "messages.json",
    defaultValue: []
  },
  {
    fileName: "contact_rate_limits.json",
    defaultValue: {}
  }
];

for (const file of filesToReset) {
  const targetPath = path.join(dataDir, file.fileName);
  fs.writeFileSync(targetPath, `${JSON.stringify(file.defaultValue, null, 2)}\n`, "utf8");
  console.log(`Reset ${file.fileName}`);
}
