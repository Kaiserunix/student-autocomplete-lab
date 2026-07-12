const { existsSync, readFileSync, readdirSync, statSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const releaseStagingRoot = path.join(root, ".runtime", "beta-release-vsix", "student-autocomplete-lab-beta-release");
const releaseVsixPath = path.join(root, ".runtime", "student-autocomplete-lab-0.1.0-beta.1-release.vsix");

const mustBeIgnored = [
  "secrets/models.env",
  ".runtime/chat-completions-usage.jsonl",
  ".runtime/ui-audit/example.png",
  ".student-autocomplete/profile.json",
  "practice/P1001.py",
  "test/tmp-smoke.py"
];

const blockedReleaseFragments = [
  "docs/",
  "scripts/",
  "dist/src/cli/",
  "dist/src/internalTesting/",
  "fixtures/",
  "test/",
  "secrets/",
  ".runtime/",
  ".js.map"
];

const blockedReleaseContent = [
  /internalTestPanel/,
  /internalTestEvents/,
  /STUDENT_AUTOCOMPLETE_INTERNAL_TEST/,
  /内测记录版/,
  /sk-[A-Za-z0-9_-]{12,}/,
  /ghp_[A-Za-z0-9_]{12,}/,
  /C:\\\\Users\\\\/i,
  /C:\\Users\\/i
];

main();

function main() {
  assertGitIgnoreCoverage();
  assertReleaseStagingCleanIfPresent();
  console.log("Project hygiene check passed.");
}

function assertGitIgnoreCoverage() {
  const missing = mustBeIgnored.filter((relativePath) => !isIgnored(relativePath));
  if (missing.length > 0) {
    throw new Error(`These local/runtime paths are not ignored by git:\n${missing.join("\n")}`);
  }
}

function isIgnored(relativePath) {
  try {
    execFileSync("git", ["check-ignore", "-q", relativePath], {
      cwd: root,
      stdio: "ignore"
    });
    return true;
  } catch {
    return false;
  }
}

function assertReleaseStagingCleanIfPresent() {
  if (!existsSync(releaseStagingRoot)) {
    throw new Error("Beta release staging tree is missing. Run npm run package:beta-release before npm run check:hygiene.");
  }
  if (!existsSync(releaseVsixPath)) {
    throw new Error("Beta release VSIX is missing. Run npm run package:beta-release before npm run check:hygiene.");
  }

  const files = listFiles(releaseStagingRoot).map((file) => ({
    absolute: file,
    relative: path.relative(releaseStagingRoot, file).replaceAll(path.sep, "/")
  }));
  const blockedFiles = files
    .map((file) => file.relative)
    .filter((relativePath) => blockedReleaseFragments.some((fragment) => relativePath.includes(fragment)));
  if (blockedFiles.length > 0) {
    throw new Error(`Beta release staging contains blocked files:\n${blockedFiles.join("\n")}`);
  }

  const blockedContentMatches = [];
  for (const file of files) {
    if (!/\.(js|json|md|txt|svg)$/i.test(file.relative)) {
      continue;
    }
    const content = readFileSync(file.absolute, "utf8");
    const pattern = blockedReleaseContent.find((item) => item.test(content));
    if (pattern) {
      blockedContentMatches.push(`${file.relative} matches ${pattern}`);
    }
  }
  if (blockedContentMatches.length > 0) {
    throw new Error(`Beta release staging contains blocked content:\n${blockedContentMatches.join("\n")}`);
  }
}

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const fullPath = path.join(dir, name);
    return statSync(fullPath).isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}
