export {
  PLATFORM_HTTPS_HOST_WHITELIST,
  isAllowedSubmitUrl,
  resolveSubmitTarget,
  validateSubmissionUrl,
  type SubmitTarget
} from "./targetRegistry";

export {
  createManualVerdictEvent,
  prepareSubmitPayload,
  stripLocalDebugAndHarness,
  type PreparedSubmission,
  type StripResult
} from "./copyAndOpen";

export {
  fetchLatestCodeforcesVerdict,
  normalizeCodeforcesVerdict,
  pollCodeforcesOfficialVerdict,
  type CodeforcesPollDependencies,
  type CodeforcesPollOptions,
  type CodeforcesPollResult,
  type CodeforcesSubmissionTarget
} from "./codeforcesPublicPoller";

export {
  PUBLIC_VERDICT_PLATFORMS,
  extractAtCoderTask,
  extractLeetCodeSlug,
  fetchLatestAtCoderVerdict,
  fetchLatestLeetCodeCnVerdict,
  fetchLatestLeetCodeGlobalVerdict,
  fetchLatestPublicVerdict,
  normalizeAtCoderResult,
  normalizeLeetCodeCnStatus,
  normalizeLeetCodeGlobalStatus,
  pollPublicOfficialVerdict,
  resolveHandleForPlatform,
  supportsPublicVerdictSync,
  type OjPublicHandles,
  type PublicVerdictFetchDependencies,
  type PublicVerdictFetchOptions,
  type PublicVerdictFetchResult,
  type PublicVerdictPollOptions,
  type PublicVerdictPollResult
} from "./publicVerdictPollers";

export {
  COMPANION_USERSCRIPT_FILENAME,
  buildCompanionUserscript,
  type CompanionUserscriptConfig
} from "./companionUserscript";
