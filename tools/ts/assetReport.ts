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

const walkFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath];
  });
};

const summarizeDirectory = (directory: string): AssetSummary => {
  const files = walkFiles(directory);
  const extensions = files.reduce<Record<string, number>>((accumulator, filePath) => {
    const extension = path.extname(filePath) || "[no extension]";
    accumulator[extension] = (accumulator[extension] ?? 0) + 1;
    return accumulator;
  }, {});

  return {
    directory: path.relative(publicDir, directory),
    fileCount: files.length,
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