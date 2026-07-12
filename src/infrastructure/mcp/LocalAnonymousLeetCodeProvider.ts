import path from "node:path";
import type { OjProviderEntrypointV1, OjProviderManifestV1 } from "../../domain/oj/contracts";
import { ojProviderManifestSchema } from "../../domain/oj/providerManifest";
import type { ProviderRegistry } from "./ProviderRegistry";

const approvedTools = [
  ["capabilities", "oj_capabilities"],
  ["health", "oj_health"],
  ["searchProblems", "oj_search_problems"],
  ["fetchProblem", "oj_fetch_problem"]
] as const;

export interface LocalAnonymousLeetCodeRegistration {
  providerId: string;
  entrypointId: "productPrivate";
}

export function admitLocalAnonymousLeetCodeProvider(
  registry: ProviderRegistry,
  input: unknown
): LocalAnonymousLeetCodeRegistration {
  const manifest = ojProviderManifestSchema.parse(input) as OjProviderManifestV1;
  assertAnonymousLeetCodeManifest(manifest);
  registry.register(manifest);
  return { providerId: manifest.providerId, entrypointId: "productPrivate" };
}

function assertAnonymousLeetCodeManifest(manifest: OjProviderManifestV1): void {
  if (manifest.platform !== "leetcode") {
    throw new Error("The local anonymous LeetCode provider manifest must target LeetCode.");
  }
  if (manifest.entrypoints.length !== 1 || manifest.entrypoints[0].id !== "productPrivate") {
    throw new Error("The local anonymous LeetCode provider must expose one productPrivate entrypoint.");
  }

  const entrypoint = manifest.entrypoints[0];
  if (entrypoint.transport !== "local_stdio" || entrypoint.url) {
    throw new Error("The local anonymous LeetCode provider must use stdio only.");
  }
  if (!entrypoint.command || !path.isAbsolute(entrypoint.command)) {
    throw new Error("The local anonymous LeetCode provider requires an explicitly injected absolute command path.");
  }
  assertAnonymousLaunch(entrypoint.command, entrypoint.args ?? []);
  if ((entrypoint.secretRefs?.length ?? 0) > 0) {
    throw new Error("The local anonymous LeetCode provider does not accept credentials or session environment variables.");
  }
  assertReadOnlyToolSurface(entrypoint);
}

function assertAnonymousLaunch(command: string, args: string[]): void {
  const commandName = path.basename(command).toLowerCase();
  if (args.length === 0) {
    if (!/^leetcode-mcp-private(?:\.exe|\.cmd)?$/.test(commandName)) {
      throw new Error("The argument-free LeetCode provider command must be the private adapter executable.");
    }
    return;
  }
  const validSiteArgs = args.length === 1 || (args.length === 3 && args[1] === "--site" && (args[2] === "global" || args[2] === "cn"));
  if (!/^node(?:\.exe)?$/.test(commandName) || !validSiteArgs || !path.isAbsolute(args[0]) || path.basename(args[0]).toLowerCase() !== "index.js") {
    throw new Error("The local anonymous LeetCode provider accepts only an absolute index.js path and an optional site selector.");
  }
  if (args.some((argument) => /session|cookie|token|password|secret/i.test(argument))) {
    throw new Error("The local anonymous LeetCode provider launch must not contain credentials.");
  }
}

function assertReadOnlyToolSurface(entrypoint: OjProviderEntrypointV1): void {
  if (entrypoint.allowedRisks.length !== 1 || entrypoint.allowedRisks[0] !== "R0_public_read") {
    throw new Error("The local anonymous LeetCode provider may allow only anonymous public reads.");
  }
  if (entrypoint.expectedTools.length !== approvedTools.length) {
    throw new Error("The local anonymous LeetCode provider must declare exactly four approved read tools.");
  }

  for (const [canonical, upstream] of approvedTools) {
    const matches = entrypoint.expectedTools.filter(
      (tool) => tool.canonical === canonical && tool.upstream === upstream && tool.risk === "R0_public_read"
    );
    if (matches.length !== 1) {
      throw new Error(`The local anonymous LeetCode provider must pin ${upstream} as ${canonical}.`);
    }
  }
}
