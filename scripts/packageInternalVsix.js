const { cp, mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const { existsSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, ".runtime");
const stagingRoot = path.join(runtimeRoot, "internal-vsix", "student-autocomplete-lab-internal");
const outPath = path.join(runtimeRoot, "student-autocomplete-lab-0.1.0-beta.1-internal.1.vsix");
const internalName = "student-autocomplete-lab-internal";
const internalViewPrefix = "studentAutocompleteInternal";
const internalDisplayName = "Student Autocomplete Lab 内测记录版";
const internalSettingsPrefix = "studentAutocompleteInternal.ai";

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  if (!existsSync(path.join(root, "dist", "src", "extension.js"))) {
    throw new Error("dist/src/extension.js not found. Run npm run compile before packaging the internal VSIX.");
  }

  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });

  await copyIfExists("dist");
  await copyIfExists("resources");
  await copyIfExists("docs");
  await copyIfExists("README.md");
  await copyIfExists("LICENSE");
  await copyIfExists("LICENSE.txt");
  await copyIfExists(".vscodeignore");

  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  packageJson.name = internalName;
  packageJson.displayName = internalDisplayName;
  packageJson.description = `${packageJson.description} Internal local-recording build for friend testing.`;
  packageJson.version = "0.1.0-beta.1-internal.1";
  packageJson.private = true;
  delete packageJson.repository;

  packageJson.activationEvents = (packageJson.activationEvents ?? []).map(renameContributionId);
  packageJson.contributes.commands = packageJson.contributes.commands.map((command) => ({
    ...command,
    command: renameContributionId(command.command),
    title: `【内测记录版】${command.title}`
  }));
  packageJson.contributes.viewsContainers.activitybar = packageJson.contributes.viewsContainers.activitybar.map((container) => ({
    ...container,
    id: renameContributionId(container.id),
    title: "AI 做题陪练 内测"
  }));
  packageJson.contributes.views = {
    [internalViewPrefix]: packageJson.contributes.views.studentAutocomplete.map((view) => ({
      ...view,
      id: renameContributionId(view.id),
      name: "做题陪练 内测记录"
    }))
  };
  packageJson.contributes.configuration = renameConfigurationProperties(
    packageJson.contributes.configuration,
    "AI 做题陪练 内测",
    internalSettingsPrefix
  );

  await writeFile(path.join(stagingRoot, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
  await patchCompiledContributionIds(path.join(stagingRoot, "dist"));

  runVscePackage(stagingRoot, outPath);

  console.log(`Internal local-recording VSIX created: ${outPath}`);
  console.log("LOCAL INTERNAL TEST BUILD ONLY. DO NOT PUBLISH.");
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

function renameContributionId(value) {
  return String(value).replaceAll("studentAutocomplete", internalViewPrefix);
}

function renameConfigurationProperties(configuration, title, expectedPrefix) {
  if (!configuration?.properties) {
    return configuration;
  }

  const properties = Object.fromEntries(
    Object.entries(configuration.properties).map(([key, value]) => [renameContributionId(key), value])
  );
  if (!Object.keys(properties).some((key) => key.startsWith(`${expectedPrefix}.`))) {
    throw new Error(`Internal package configuration does not register ${expectedPrefix}.* settings.`);
  }

  return {
    ...configuration,
    title,
    properties
  };
}

async function copyIfExists(relativePath) {
  const source = path.join(root, relativePath);
  if (!existsSync(source)) {
    return;
  }
  await cp(source, path.join(stagingRoot, relativePath), { recursive: true });
}

async function patchCompiledContributionIds(dir) {
  if (!existsSync(dir)) {
    return;
  }

  const entries = await require("node:fs/promises").readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await patchCompiledContributionIds(fullPath);
      continue;
    }
    if (!entry.name.endsWith(".js") && !entry.name.endsWith(".js.map")) {
      continue;
    }

    const source = await readFile(fullPath, "utf8");
    const patched = source
      .replaceAll("studentAutocomplete", internalViewPrefix)
      .replaceAll("Student Autocomplete Lab", internalDisplayName);
    await writeFile(fullPath, patched, "utf8");
  }
}
