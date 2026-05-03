const { cp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { execSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, ".runtime");
const releaseDist = path.join(runtimeRoot, "beta-release-dist", "src");
const stagingRoot = path.join(runtimeRoot, "beta-release-vsix", "student-autocomplete-lab-beta-release");
const outPath = path.join(runtimeRoot, "student-autocomplete-lab-0.1.0-beta.1-release.vsix");
const releaseName = "student-autocomplete-lab-beta-release";
const releaseViewPrefix = "studentAutocompleteBetaRelease";
const releaseDisplayName = "Student Autocomplete Lab Beta Release";

const allowedTopLevelRuntime = [
  "extension.js",
  "autocomplete",
  "config",
  "models",
  "problemBank",
  "release",
  "sidebar",
  "storage"
];

const allowedTeachingFiles = [
  "attemptEvent.js",
  "lessonReport.js",
  "mimoTeacher.js",
  "optimizationReport.js",
  "recommendationCatalog.js",
  "recommendationEngine.js",
  "solutionScore.js",
  "solutionScoreGate.js",
  "studentProfile.js",
  "studentProfileStore.js",
  "studentSkill.js",
  "studentSkillStore.js",
  "submissionJudge.js",
  "teacherPack.js",
  "teachingCycle.js",
  "teachingPrompt.js",
  "teachingReport.js",
  "teachingTaxonomy.js",
  "types.js"
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(path.join(root, "tsconfig.release.json"))) {
    throw new Error("tsconfig.release.json not found. Run npm run compile:release before packaging beta release.");
  }
  if (!existsSync(path.join(releaseDist, "extension.js"))) {
    throw new Error("Release dist not found. Run npm run compile:release before packaging beta release.");
  }

  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(path.join(stagingRoot, "dist", "src"), { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });

  await copyReleaseRuntime();
  await copyIfExists("resources");
  await copyIfExists("LICENSE");
  await copyReleaseReadme();
  await writeReleasePackageJson();
  await patchReleaseRuntime();

  assertCleanReleaseTree();

  execSync(
    `npx --yes @vscode/vsce package --no-dependencies --allow-missing-repository --out "${outPath}"`,
    {
      cwd: stagingRoot,
      stdio: "inherit"
    }
  );

  console.log(`Beta release VSIX created: ${outPath}`);
}

async function copyReleaseRuntime() {
  for (const item of allowedTopLevelRuntime) {
    await cp(path.join(releaseDist, item), path.join(stagingRoot, "dist", "src", item), { recursive: true });
  }
  await mkdir(path.join(stagingRoot, "dist", "src", "teaching"), { recursive: true });
  for (const file of allowedTeachingFiles) {
    await cp(path.join(releaseDist, "teaching", file), path.join(stagingRoot, "dist", "src", "teaching", file));
  }
}

async function writeReleasePackageJson() {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  packageJson.name = releaseName;
  packageJson.displayName = releaseDisplayName;
  packageJson.description = "Clean beta-release package for the Student Autocomplete Lab VS Code algorithm coach.";
  packageJson.private = false;
  packageJson.files = ["dist/**", "resources/**", "README.md", "LICENSE"];
  delete packageJson.repository;
  delete packageJson.scripts;
  delete packageJson.devDependencies;
  delete packageJson.dependencies;
  packageJson.activationEvents = (packageJson.activationEvents ?? []).map(renameContributionId);
  packageJson.contributes.commands = packageJson.contributes.commands.map((command) => ({
    ...command,
    command: renameContributionId(command.command)
  }));
  packageJson.contributes.viewsContainers.activitybar = packageJson.contributes.viewsContainers.activitybar.map((container) => ({
    ...container,
    id: renameContributionId(container.id),
    title: "AI 做题陪练 Release"
  }));
  packageJson.contributes.views = {
    [releaseViewPrefix]: packageJson.contributes.views.studentAutocomplete.map((view) => ({
      ...view,
      id: renameContributionId(view.id),
      name: "做题陪练 Release"
    }))
  };
  await writeFile(path.join(stagingRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function patchReleaseRuntime() {
  await patchCompiledContributionIds(path.join(stagingRoot, "dist", "src"));
  await patchTextFile(path.join(stagingRoot, "dist", "src", "extension.js"), (text) =>
    text.replace('require("./internalTesting/internalTestRecorder")', 'require("./release/noopInternalTestRecorder")')
  );
  await patchTextFile(path.join(stagingRoot, "dist", "src", "sidebar", "ProblemBankViewProvider.js"), (text) =>
    text.replace('require("../internalTesting/internalTestRecorder")', 'require("../release/noopInternalTestRecorder")')
  );
}

function assertCleanReleaseTree() {
  const blockedFragments = [
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
  const files = listFiles(stagingRoot).map((file) => path.relative(stagingRoot, file).replaceAll(path.sep, "/"));
  const bad = files.filter((file) => blockedFragments.some((fragment) => file.includes(fragment)));
  if (bad.length > 0) {
    throw new Error(`Beta release package contains blocked files:\n${bad.join("\n")}`);
  }
}

function listFiles(dir) {
  const fs = require("node:fs");
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
  });
}

function renameContributionId(value) {
  return String(value)
    .replaceAll("studentAutocomplete.problemBankWebview", `${releaseViewPrefix}.problemBankWebview`)
    .replaceAll("studentAutocomplete", releaseViewPrefix);
}

async function copyIfExists(relativePath) {
  const source = path.join(root, relativePath);
  if (existsSync(source)) {
    await cp(source, path.join(stagingRoot, relativePath), { recursive: true });
  }
}

async function copyReleaseReadme() {
  await cp(path.join(root, "README.release.md"), path.join(stagingRoot, "README.md"));
}

async function patchCompiledContributionIds(dir) {
  const entries = await require("node:fs/promises").readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await patchCompiledContributionIds(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".js")) {
      continue;
    }
    await patchTextFile(fullPath, (text) =>
      text
        .replaceAll("studentAutocomplete.problemBankWebview", `${releaseViewPrefix}.problemBankWebview`)
        .replaceAll("studentAutocomplete", releaseViewPrefix)
        .replaceAll("Student Autocomplete Lab", releaseDisplayName)
    );
  }
}

async function patchTextFile(filePath, patcher) {
  const source = await readFile(filePath, "utf8");
  await writeFile(filePath, patcher(source), "utf8");
}
