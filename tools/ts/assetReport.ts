import fs from "node:fs";
import path from "node:path";

type AssetSummary = {
  directory: string;
  fileCount: number;
  extensions: Record<string, number>;
};

const publicDir = path.join(__dirname, "..", "..", "..", "public");
const assetDirs = [
  path.join(publicDir, "assets", "img"),
  path.join(publicDir, "assets", "css"),
  path.join(publicDir, "assets", "js"),
];

const summarizeDirectory = (directory: string): AssetSummary => {
  const extensions: Record<string, number> = {};
  let fileCount = 0;
  const pendingDirectories = [directory];

  while (pendingDirectories.length > 0) {
    const currentDirectory = pendingDirectories.pop();
    if (!currentDirectory) {
      continue;
    }

    const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
        continue;
      }

      fileCount += 1;
      const extension = path.extname(entryPath) || "[no extension]";
      extensions[extension] = (extensions[extension] ?? 0) + 1;
    }
  }

  return {
    directory: path.relative(publicDir, directory),
    fileCount,
    extensions,
  };
};

console.log("Asset Report");
for (const summary of assetDirs.map(summarizeDirectory)) {
  console.log(`- ${summary.directory}`);
  console.log(`  files: ${summary.fileCount}`);
  for (const [extension, count] of Object.entries(summary.extensions).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${extension}: ${count}`);
  }
}