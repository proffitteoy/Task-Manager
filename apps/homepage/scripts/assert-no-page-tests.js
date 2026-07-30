const { readdirSync } = require("node:fs");
const path = require("node:path");

const pagesDirectory = path.join(__dirname, "..", "src", "pages");
const testFilePattern = /\.(?:spec|test)\.[cm]?[jt]sx?$/i;

function findPageTests(directory, matches = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") {
        matches.push(entryPath);
      } else {
        findPageTests(entryPath, matches);
      }
    } else if (entry.isFile() && testFilePattern.test(entry.name)) {
      matches.push(entryPath);
    }
  }
  return matches;
}

function assertNoPageTests(directory = pagesDirectory) {
  const matches = findPageTests(directory);
  if (matches.length === 0) return;

  const relativeMatches = matches.map((entry) => path.relative(path.dirname(pagesDirectory), entry));
  throw new Error(
    [
      "Next.js pages must not contain test/spec files or __tests__ directories.",
      "Move these files under src/__tests__ so they cannot become production routes:",
      ...relativeMatches.map((entry) => `- ${entry}`),
    ].join("\n"),
  );
}

if (require.main === module) {
  assertNoPageTests();
  console.log("Verified that src/pages contains production routes only.");
}

module.exports = { assertNoPageTests, findPageTests };
