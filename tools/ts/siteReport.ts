import fs from "node:fs";
import path from "node:path";

type PageReport = {
  fileName: string;
  title: string;
  description: string;
  sectionCount: number;
};

const publicDir = path.join(__dirname, "..", "..", "..", "public");
const pageFiles = ["index.html", "about.html", "projects.html", "services.html", "contact.html", "admin.html"];

const extractFirst = (content: string, pattern: RegExp): string => {
  const match = content.match(pattern);
  return match?.[1]?.trim() ?? "missing";
};

const inspectPage = (fileName: string): PageReport => {
  const filePath = path.join(publicDir, fileName);
  const content = fs.readFileSync(filePath, "utf8");

  return {
    fileName,
    title: extractFirst(content, /<title>([^<]+)<\/title>/i),
    description: extractFirst(content, /<meta\s+name="description"\s+content="([^"]*)"/i),
    sectionCount: (content.match(/<section\b/gi) ?? []).length,
  };
};

const reports = pageFiles.map(inspectPage);

console.log("Site Report");
for (const report of reports) {
  console.log(`- ${report.fileName}`);
  console.log(`  title: ${report.title}`);
  console.log(`  description: ${report.description}`);
  console.log(`  sections: ${report.sectionCount}`);
}