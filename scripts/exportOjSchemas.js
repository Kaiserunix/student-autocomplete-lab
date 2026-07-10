const fs = require("node:fs/promises");
const path = require("node:path");
const { buildOjSchemaArtifacts } = require("../dist/src/domain/oj/schemaArtifacts.js");

async function main() {
  const outputDirectory = path.join(__dirname, "..", "resources", "oj-contract", "v1");
  await fs.mkdir(outputDirectory, { recursive: true });

  for (const [fileName, contents] of Object.entries(buildOjSchemaArtifacts())) {
    await fs.writeFile(path.join(outputDirectory, fileName), contents, "utf8");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
