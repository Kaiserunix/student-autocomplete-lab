export {
  CURATED_SHEETS,
  curatedEntryToMetadataDocument,
  getCuratedSheet,
  listCuratedSheets,
  type CuratedDifficulty,
  type CuratedProblemEntry,
  type CuratedSheet
} from "./sheets/curatedSheets";

export {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  createTimeoutSignal,
  fetchWithTimeout,
  isAntiBotChallenge,
  mapHttpStatusError,
  type TimeoutSignalHandle
} from "./adapters/httpClient";

export {
  decodeHtmlEntities,
  extractTexFromEquationImgTag,
  htmlToMarkdown,
  stripHtmlTags
} from "./adapters/htmlUtils";

export {
  LeetCodeAdapter,
  createLeetCodeCnAdapter,
  createLeetCodeGlobalAdapter,
  extractLeetCodeExampleOutputs,
  type LeetCodeAdapterOptions,
  type LeetCodeSite
} from "./adapters/leetcodeAdapter";

export {
  LuoguAdapter,
  extractLuoguEnvelopeFromHtml,
  fetchLuoguRemoteProblem,
  normalizeLuoguPid,
  normalizeLuoguProblemPayload,
  type FetchLuoguRemoteProblemOptions,
  type LuoguAdapterOptions,
  type LuoguRemoteProblemData
} from "./adapters/luoguAdapter";

export {
  AtCoderAdapter,
  atcoderDifficultyToTier,
  parseAtCoderTaskHtml,
  type AtCoderAdapterOptions,
  type ParsedAtCoderTaskHtml
} from "./adapters/atcoderAdapter";

export {
  CodeforcesAdapter,
  codeforcesRatingToTier,
  parseCodeforcesRef,
  type CodeforcesAdapterOptions,
  type CodeforcesStatementMirror,
  type ParsedCfRef
} from "./adapters/codeforcesAdapter";

export {
  NowCoderAdapter,
  parseNowCoderHtml,
  type NowCoderAdapterOptions,
  type ParsedNowCoderHtml
} from "./adapters/nowcoderAdapter";

export {
  mergeProblemDocuments,
  parseMarkdownProblem,
  type MarkdownProblemParseOptions
} from "./parsers/markdownParser";

export {
  LocalhostBridge,
  isAllowedLoopbackHost,
  isAllowedVerdictCorsOrigin,
  normalizeBridgeVerdictPayload,
  normalizeBridgeVerdictText,
  normalizeCompetitiveCompanionPayload,
  type BridgeVerdictPayload,
  type CompetitiveCompanionPayload,
  type LocalhostBridgeOptions,
  type NormalizedBridgeVerdict
} from "./bridge/localhostBridge";

export {
  ProblemRepository,
  type ProblemRepositoryOptions
} from "./problemRepository";

export {
  generateStarterTemplate,
  type GeneratedTemplate
} from "./templateGenerator";
