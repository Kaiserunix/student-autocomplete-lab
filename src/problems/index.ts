export {
  CURATED_SHEETS,
  curatedEntryToMetadataDocument,
  getCuratedSheet,
  listCuratedSheets,
  type CuratedDifficulty,
  type CuratedProblemEntry,
  type CuratedSheet
} from "./sheets/curatedSheets";

export { decodeHtmlEntities, htmlToMarkdown, stripHtmlTags } from "./adapters/htmlUtils";

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
  normalizeLuoguPid,
  normalizeLuoguProblemPayload,
  type LuoguAdapterOptions
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
  type ParsedCfRef
} from "./adapters/codeforcesAdapter";

export { NowCoderAdapter } from "./adapters/nowcoderAdapter";

export {
  mergeProblemDocuments,
  parseMarkdownProblem,
  type MarkdownProblemParseOptions
} from "./parsers/markdownParser";

export {
  LocalhostBridge,
  isAllowedLoopbackHost,
  normalizeCompetitiveCompanionPayload,
  type CompetitiveCompanionPayload,
  type LocalhostBridgeOptions
} from "./bridge/localhostBridge";

export {
  ProblemRepository,
  type ProblemRepositoryOptions
} from "./problemRepository";

export {
  generateStarterTemplate,
  type GeneratedTemplate
} from "./templateGenerator";
