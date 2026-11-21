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
