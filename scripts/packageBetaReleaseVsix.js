const { cp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, ".runtime");
const releaseDist = path.join(runtimeRoot, "beta-release-dist", "src");
const stagingRoot = path.join(runtimeRoot, "beta-release-vsix", "student-autocomplete-lab-beta-release");
const outPath = path.join(runtimeRoot, "student-autocomplete-lab-0.1.0-beta.1-release.vsix");
const releaseName = "student-autocomplete-lab-beta-release";
const releaseViewPrefix = "studentAutocompleteBetaRelease";
const releaseDisplayName = "Student Autocomplete Lab Beta Release";
const releaseSettingsPrefix = "studentAutocompleteBetaRelease.ai";

const allowedTopLevelRuntime = [
  "attempt",
  "extension.js",
  "autocomplete",
  "config",
  "mcp",
  "models",
  "problemBank",
  "recommendation",
  "release",
  "sidebar",
  "storage",
  "ui"
];

const allowedTeachingFiles = [
  "attemptEvent.js",
  "coachFollowUp.js",
  "lessonReport.js",
  "luoguMcpRecommendationCandidates.js",
  "mimoTeacher.js",
  "optimizationReport.js",
  "recommendationCatalog.js",
  "recommendationEngine.js",
  "solutionScore.js",
  "solutionScoreGate.js",
  "studentProfile.js",
  "studentProfileStore.js",
  "studentSkill.js",
  "studentSkillLifecycle.js",
  "studentSkillStore.js",
  "submissionJudge.js",
  "teacherPack.js",
  "teachingCycle.js",
  "teachingPrompt.js",
  "teachingReport.js",
  "teachingTaxonomy.js",
  "types.js"
];

const blockedCompiledReleaseFiles = [
  path.join("teaching", "fixtureTeachingContext.js"),
  path.join("teaching", "journeyTrial.js"),
  path.join("teaching", "longitudinalSelfEvolution.js"),
  path.join("teaching", "selfEvolutionEval.js"),
  path.join("teaching", "selfEvolutionTrial.js"),
  path.join("teaching", "stubTeacher.js"),
  path.join("teaching", "transferValidation.js"),
  path.join("mcp", "problemSearchServer.js")
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
  assertNoBlockedReleaseContent();

  runVscePackage(stagingRoot, outPath);

  console.log(`Beta release VSIX created: ${outPath}`);
}

function runVscePackage(cwd, outputPath) {
  const args = ["--yes", "@vscode/vsce", "package", "--no-dependencies", "--allow-missing-repository", "--out", outputPath];
  if (process.platform === "win32") {
    execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx.cmd", ...args], {
      cwd,
      stdio: "inherit"
    });
    return;
  }

  execFileSync("npx", args, {
    cwd,
    stdio: "inherit"
  });
}

async function copyReleaseRuntime() {
  for (const item of allowedTopLevelRuntime) {
    await cp(path.join(releaseDist, item), path.join(stagingRoot, "dist", "src", item), { recursive: true });
  }
  await mkdir(path.join(stagingRoot, "dist", "src", "teaching"), { recursive: true });
  for (const file of allowedTeachingFiles) {
    await cp(path.join(releaseDist, "teaching", file), path.join(stagingRoot, "dist", "src", "teaching", file));
  }
  await cp(
    path.join(releaseDist, "teaching", "workflow"),
    path.join(stagingRoot, "dist", "src", "teaching", "workflow"),
    { recursive: true }
  );
  await cp(path.join(root, "dist", "webview"), path.join(stagingRoot, "dist", "webview"), { recursive: true });
  for (const relativePath of blockedCompiledReleaseFiles) {
    await rm(path.join(stagingRoot, "dist", "src", relativePath), { force: true });
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
      name: view.name
    }))
  };
  renameContributionReferences(packageJson.contributes);
  packageJson.contributes.configuration = renameConfigurationProperties(
    packageJson.contributes.configuration,
    "AI 做题陪练 Release",
    releaseSettingsPrefix
  );
  await writeFile(path.join(stagingRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
}

async function patchReleaseRuntime() {
  await patchCompiledContributionIds(path.join(stagingRoot, "dist", "src"));
  await patchTextFile(path.join(stagingRoot, "dist", "src", "extension.js"), (text) =>
    text.replace('require("./internalTesting/internalTestRecorder")', 'require("./release/noopInternalTestRecorder")')
  );
  await patchTextFile(path.join(stagingRoot, "dist", "src", "sidebar", "ProblemBankViewProvider.js"), (text) =>
    stripReleaseInternalTestingUi(text).replace(
      'require("../internalTesting/internalTestRecorder")',
      'require("../release/noopInternalTestRecorder")'
    )
  );
}

function stripReleaseInternalTestingUi(text) {
  return text
    .replaceAll("内测记录版", "本地记录未开启")
    .replaceAll("内测记录摘要", "本地记录摘要不可用")
    .replaceAll("内测记录", "本地记录")
    .replaceAll("internalTestPanel", "releaseRecordPanel")
    .replaceAll("internalTestEventsPath", "releaseRecordPath")
    .replaceAll("internalTestEvents", "releaseRecordEvents")
    .replaceAll("本地记录已开启，不会自动上传", "本地记录未开启")
    .replaceAll(
      "这个面板只会出现在内测包或显式开启环境变量时。记录可能包含题号、模型、痛点、纠偏备注和工作区路径。",
      "公开包不包含本地记录面板。"
    )
    .replaceAll("Student Autocomplete Lab Beta Release 内测记录版", "Student Autocomplete Lab Beta Release")
    .replaceAll("正式版：内测记录未开启。", "正式版：本地记录未开启。");
}

function assertCleanReleaseTree() {
  const blockedFragments = [
    "docs/",
    "scripts/",
    "dist/src/cli/",
    "dist/src/internalTesting/",
    "dist/src/teaching/longitudinalSelfEvolution.js",
    "dist/src/teaching/selfEvolution",
    "dist/src/teaching/journeyTrial.js",
    "dist/src/teaching/transferValidation.js",
    "dist/src/mcp/problemSearchServer.js",
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

function assertNoBlockedReleaseContent() {
  const blockedPatterns = [
    /internalTestPanel/,
    /internalTestEvents/,
    /STUDENT_AUTOCOMPLETE_INTERNAL_TEST/,
    /内测记录版/,
    /sk-[A-Za-z0-9_-]{12,}/,
    /ghp_[A-Za-z0-9_]{12,}/,
    /C:\\\\Users\\\\/i
  ];
  const files = listFiles(stagingRoot).filter((file) => /\.(js|json|md|txt|svg)$/i.test(file));
  const bad = [];
  for (const file of files) {
    const content = require("node:fs").readFileSync(file, "utf8");
    const match = blockedPatterns.find((pattern) => pattern.test(content));
    if (match) {
      bad.push(`${path.relative(stagingRoot, file)} matches ${match}`);
    }
  }
  if (bad.length > 0) {
    throw new Error(`Beta release package contains blocked content:\n${bad.join("\n")}`);
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
  return String(value).replaceAll("studentAutocomplete", releaseViewPrefix);
}

function renameContributionReferences(contributes) {
  contributes.viewsWelcome = (contributes.viewsWelcome ?? []).map((welcome) => ({
    ...welcome,
    view: renameContributionId(welcome.view),
    contents: renameContributionId(welcome.contents)
  }));
  contributes.menus = Object.fromEntries(
    Object.entries(contributes.menus ?? {}).map(([location, items]) => [
      location,
      items.map((item) => ({
        ...item,
        command: renameContributionId(item.command),
        when: item.when ? renameContributionId(item.when) : item.when
      }))
    ])
  );
}

function renameConfigurationProperties(configuration, title, expectedPrefix) {
  if (!configuration?.properties) {
    return configuration;
  }

  const properties = Object.fromEntries(
    Object.entries(configuration.properties).map(([key, value]) => [renameContributionId(key), value])
  );
  if (!Object.keys(properties).some((key) => key.startsWith(`${expectedPrefix}.`))) {
    throw new Error(`Beta release package configuration does not register ${expectedPrefix}.* settings.`);
  }

  return {
    ...configuration,
    title,
    properties
  };
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
        .replaceAll("studentAutocomplete", releaseViewPrefix)
        .replaceAll("Student Autocomplete Lab", releaseDisplayName)
    );
  }
}

async function patchTextFile(filePath, patcher) {
  const source = await readFile(filePath, "utf8");
  await writeFile(filePath, patcher(source), "utf8");
}
