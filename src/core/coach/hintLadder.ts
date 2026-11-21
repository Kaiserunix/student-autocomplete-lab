import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CoachStrictness, HintLevel, StuckCategory } from "../contracts";

export interface HintLevelSpec {
  level: HintLevel;
  code: string;
  titleZh: string;
  titleEn: string;
  allowedScopeZh: string;
  allowedScopeEn: string;
  forbiddenZh: string;
  forbiddenEn: string;
  allowsAlgorithmName: boolean;
  allowsDataStructureName: boolean;
  allowsPseudocodeSkeleton: boolean;
  allowsFullCode: boolean;
}

export const HINT_LEVEL_SPECS: Record<HintLevel, HintLevelSpec> = {
  0: {
    level: 0,
    code: "L0_OBSERVE",
    titleZh: "L0 · 独立思考中",
    titleEn: "L0 · Independent Attempt",
    allowedScopeZh: "尚未请求提示。",
    allowedScopeEn: "No hint requested yet.",
    forbiddenZh: "禁止提前剧透解法。",
    forbiddenEn: "Do not spoil the solution.",
    allowsAlgorithmName: false,
    allowsDataStructureName: false,
    allowsPseudocodeSkeleton: false,
    allowsFullCode: false
  },
  1: {
    level: 1,
    code: "L1_PROBLEM_OBSERVATION",
    titleZh: "L1 · 审题观察",
    titleEn: "L1 · Problem Observation",
    allowedScopeZh: "聚焦题面约束、输入规模、边界条件与题目本质不变量，提出 1 个引导观察的问题。",
    allowedScopeEn: "Focus on problem constraints, input scale, boundary conditions, and core invariants; ask 1 guiding observation question.",
    forbiddenZh: "严禁点名具体算法或数据结构，严禁出现代码块或伪代码。",
    forbiddenEn: "Never name the algorithm or data structure; zero code blocks or pseudocode.",
    allowsAlgorithmName: false,
    allowsDataStructureName: false,
    allowsPseudocodeSkeleton: false,
    allowsFullCode: false
  },
  2: {
    level: 2,
    code: "L2_PATTERN_ANALOGY",
    titleZh: "L2 · 经典模式联想（不点名）",
    titleEn: "L2 · Classic Pattern Analogy (Unnamed)",
    allowedScopeZh: "引导联想题目的结构特征（如单调性、重叠子问题、区间收缩、局部最优或传递关系），但不点名算法或数据结构。",
    allowedScopeEn: "Guide recognition of structural properties (monotonicity, overlapping subproblems, window contraction, transitivity) WITHOUT naming the algorithm or data structure.",
    forbiddenZh: "严禁直接点名算法名称与数据结构名称，严禁出现代码块或完整逻辑。",
    forbiddenEn: "Never name the concrete algorithm or data structure; zero code blocks.",
    allowsAlgorithmName: false,
    allowsDataStructureName: false,
    allowsPseudocodeSkeleton: false,
    allowsFullCode: false
  },
  3: {
    level: 3,
    code: "L3_SOLUTION_DIRECTION",
    titleZh: "L3 · 解法方向（不点名数据结构）",
    titleEn: "L3 · Solution Direction (No Data Structure Name)",
    allowedScopeZh: "指出核心推导方向、需要维护的关键状态/不变量以及为什么暴力会重复计算，但仍不点名具体数据结构或贴代码。",
    allowedScopeEn: "Explain the conceptual solution direction, key state/invariant to maintain, and what redundant work to eliminate, WITHOUT naming a specific data structure or showing code.",
    forbiddenZh: "严禁点名具体数据结构容器名，严禁出现代码块或可执行语句。",
    forbiddenEn: "Do not name concrete data structures; zero fenced code blocks or executable statements.",
    allowsAlgorithmName: false,
    allowsDataStructureName: false,
    allowsPseudocodeSkeleton: false,
    allowsFullCode: false
  },
  4: {
    level: 4,
    code: "L4_NAME_ALGORITHM_AND_DS",
    titleZh: "L4 · 点明算法与数据结构",
    titleEn: "L4 · Name Algorithm & Data Structure",
    allowedScopeZh: "明确点出推荐算法与核心数据结构、目标时空复杂度以及最容易踩坑的边界条件，由学生自行编码。",
    allowedScopeEn: "Explicitly name the recommended algorithm, core data structure, target time/space complexity, and critical boundary pitfalls; let the student write the code.",
    forbiddenZh: "严禁给出 fenced code block、完整程序骨架或参考代码片段。",
    forbiddenEn: "Strictly forbid fenced code blocks, runnable program skeletons, or reference solution code.",
    allowsAlgorithmName: true,
    allowsDataStructureName: true,
    allowsPseudocodeSkeleton: false,
    allowsFullCode: false
  },
  5: {
    level: 5,
    code: "L5_PSEUDOCODE_SKELETON",
    titleZh: "L5 · 伪代码骨架（非完整代码）",
    titleEn: "L5 · Pseudocode Skeleton (Non-Runnable)",
    allowedScopeZh: "提供 ≤12 行的抽象步骤伪代码骨架（用中文/英文自然语言步骤与占位符），仍不提供可直接复制提交的完整可运行代码。",
    allowedScopeEn: "Provide a concise <=12-line high-level pseudocode outline with conceptual placeholders; still NO copy-pasteable runnable program or full solution.",
    forbiddenZh: "严禁输出完整可运行程序骨架（如 int main / def solve / class Solution / 完整 I/O）或照抄参考解。",
    forbiddenEn: "Strictly forbid complete runnable skeletons (int main, def solve, class Solution, full I/O) or reference solution overlap.",
    allowsAlgorithmName: true,
    allowsDataStructureName: true,
    allowsPseudocodeSkeleton: true,
    allowsFullCode: false
  }
};

export interface StuckCategorySpec {
  category: StuckCategory;
  labelZh: string;
  labelEn: string;
  coachingFocusZh: string;
  coachingFocusEn: string;
}

export const STUCK_CATEGORY_SPECS: Record<StuckCategory, StuckCategorySpec> = {
  no_idea: {
    category: "no_idea",
    labelZh: "完全没思路",
    labelEn: "No Idea Where to Start",
    coachingFocusZh: "先构造极小样例（n=2~4）并分析暴力解在做什么，再通过数据规模约束定位冗余计算。",
    coachingFocusEn: "Start from a tiny example (n=2..4), formulate brute force first, then locate redundant work using the input constraints."
  },
  tle: {
    category: "tle",
    labelZh: "超时（TLE）",
    labelEn: "Time Limit Exceeded (TLE)",
    coachingFocusZh: "估算当前代码的时间复杂度与数据规模预算的差距，找出最内层可被剪枝、缓存或单调维护的重复扫描。",
    coachingFocusEn: "Compare current complexity against the input constraint budget and isolate which inner-loop work can be cached, pruned, or maintained monotonically."
  },
  partial_wa: {
    category: "partial_wa",
    labelZh: "部分样例 WA",
    labelEn: "Partial Wrong Answer (WA)",
    coachingFocusZh: "针对失败样例或边界构造最小反例进行变量干跑（Dry-Run），定位不变量首次被打破的步数。",
    coachingFocusEn: "Dry-run the smallest failing counterexample step-by-step to locate the exact step where your invariant first breaks."
  },
  implementation: {
    category: "implementation",
    labelZh: "有思路但实现卡壳 / RE",
    labelEn: "Implementation Stuck / Runtime Error",
    coachingFocusZh: "聚焦单一局部语义（下标开闭区间、空容器保护、递归出口、有向/无向建边或整型位宽），一次只核对一处。",
    coachingFocusEn: "Isolate one local implementation detail (index bounds, empty container check, recursion base case, graph edge direction, or integer width) at a time."
  }
};

export interface StrictnessPersonaSpec {
  strictness: CoachStrictness;
  labelZh: string;
  labelEn: string;
  systemDirectiveZh: string;
  systemDirectiveEn: string;
}

export const STRICTNESS_PERSONA_SPECS: Record<CoachStrictness, StrictnessPersonaSpec> = {
  gentle: {
    strictness: "gentle",
    labelZh: "温和引导",
    labelEn: "Gentle",
    systemDirectiveZh: "语气友善耐心，肯定学生已经写对的局部思路，再用清晰小步问题引导下一步，但绝不放宽防剧透限制。",
    systemDirectiveEn: "Use a patient, encouraging tone; acknowledge valid partial reasoning before guiding the next small step without relaxing spoiler limits."
  },
  standard: {
    strictness: "standard",
    labelZh: "标准苏格拉底",
    labelEn: "Standard",
    systemDirectiveZh: "保持克制、精准、高信息密度的苏格拉底提问风格：少废话、直击不变量与关键反例。",
    systemDirectiveEn: "Be concise, objective, and Socratic: skip filler and focus tightly on invariants and counterexamples."
  },
  strict: {
    strictness: "strict",
    labelZh: "严厉零谄媚",
    labelEn: "Strict (Zero-Sycophancy)",
    systemDirectiveZh: "严格执行零谄媚（Zero-Sycophancy）原则：严禁说「很棒的尝试」「思路很好」「你已经很接近了」等空洞夸奖；直接尖锐指出逻辑漏洞、复杂度硬伤或边界谬误，并要求学生用反例证明自己的写法。",
    systemDirectiveEn: "Enforce strict zero-sycophancy: NEVER use empty flattery ('Great try!', 'Nice job!', 'Almost there!'); directly pinpoint logical flaws, complexity violations, or broken invariants and demand a proof or counterexample trace."
  }
};

export interface HintTransitionRecord {
  timestamp: string;
  action: "hint" | "giveUp" | "reopen";
  fromLevel: HintLevel;
  toLevel: HintLevel;
  stuckCategory?: StuckCategory;
}

export interface HintLadderState {
  problemKey: string;
  currentLevel: HintLevel;
  hintsRequestedCount: number;
  giveUpUnlocked: boolean;
  giveUpUnlockedAt?: string;
  stuckCategory?: StuckCategory;
  strictness: CoachStrictness;
  sessionReopenCount: number;
  createdAt: string;
  updatedAt: string;
  history: HintTransitionRecord[];
}

export interface HintLadderStore {
  loadAll(): Promise<Record<string, HintLadderState>>;
  saveAll(states: Record<string, HintLadderState>): Promise<void>;
}

export class InMemoryHintLadderStore implements HintLadderStore {
  private states: Record<string, HintLadderState>;

  constructor(initial: Record<string, HintLadderState> = {}) {
    this.states = structuredClone(initial);
  }

  public async loadAll(): Promise<Record<string, HintLadderState>> {
    return structuredClone(this.states);
  }

  public async saveAll(states: Record<string, HintLadderState>): Promise<void> {
    this.states = structuredClone(states);
  }
}

export class FileHintLadderStore implements HintLadderStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public get path(): string {
    return this.filePath;
  }

  public async loadAll(): Promise<Record<string, HintLadderState>> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, HintLadderState>;
      }
      return {};
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        return {};
      }
      throw error;
    }
  }

  public async saveAll(states: Record<string, HintLadderState>): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(states, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.filePath);
  }
}

export interface AdvanceHintOptions {
  stuckCategory?: StuckCategory;
  strictness?: CoachStrictness;
  /**
   * Even if a caller requests a higher target level, the deterministic ladder
   * enforces NO-SKIP progression (at most currentLevel + 1, capped at 5).
   */
  requestedLevel?: HintLevel;
  now?: string;
}

/**
 * Deterministic 5-level Socratic Hint Ladder state machine persisted per `problemKey`.
 * Invariants:
 * - Advances strictly one level at a time (0 -> 1 -> 2 -> 3 -> 4 -> 5), never skipping.
 * - Reopening a chat/session NEVER resets `currentLevel` to 0.
 * - Full solution is ONLY unlocked via explicit `unlockGiveUp(problemKey, true)`.
 */
export class HintLadderMachine {
  private readonly store: HintLadderStore;
  private readonly defaultStrictness: CoachStrictness;
  private cache: Record<string, HintLadderState> | null = null;

  constructor(options: { store?: HintLadderStore; defaultStrictness?: CoachStrictness } = {}) {
    this.store = options.store ?? new InMemoryHintLadderStore();
    this.defaultStrictness = options.defaultStrictness ?? "standard";
  }

  public async getState(problemKey: string, now?: string): Promise<HintLadderState> {
    const states = await this.ensureLoaded();
    const existing = states[problemKey];
    if (existing) {
      return structuredClone(existing);
    }
    const ts = now ?? new Date().toISOString();
    return createInitialHintLadderState(problemKey, this.defaultStrictness, ts);
  }

  /**
   * Deterministic next-level step: advances by strictly +1 (max 5), never skips levels.
   */
  public async requestNextHint(
    problemKey: string,
    options: AdvanceHintOptions = {}
  ): Promise<{ state: HintLadderState; spec: HintLevelSpec; skippedAttempted: boolean }> {
    const states = await this.ensureLoaded();
    const ts = options.now ?? new Date().toISOString();
    const prev =
      states[problemKey] ??
      createInitialHintLadderState(problemKey, options.strictness ?? this.defaultStrictness, ts);

    const maxAllowedNext = Math.min(5, prev.currentLevel + 1) as HintLevel;
    const requested = options.requestedLevel;
    const skippedAttempted = requested !== undefined && requested > maxAllowedNext;
    const nextLevel =
      requested !== undefined && requested <= prev.currentLevel
        ? prev.currentLevel
        : maxAllowedNext;

    const nextState: HintLadderState = {
      ...prev,
      currentLevel: nextLevel,
      hintsRequestedCount: prev.hintsRequestedCount + 1,
      stuckCategory: options.stuckCategory ?? prev.stuckCategory,
      strictness: options.strictness ?? prev.strictness,
      updatedAt: ts,
      history: [
        ...prev.history,
        {
          timestamp: ts,
          action: "hint",
          fromLevel: prev.currentLevel,
          toLevel: nextLevel,
          stuckCategory: options.stuckCategory ?? prev.stuckCategory
        }
      ]
    };

    states[problemKey] = nextState;
    await this.store.saveAll(states);

    return {
      state: structuredClone(nextState),
      spec: HINT_LEVEL_SPECS[nextLevel],
      skippedAttempted
    };
  }

  /**
   * Reopening a conversation explicitly preserves `currentLevel` and history (NEVER resets to 0).
   */
  public async reopenSession(problemKey: string, now?: string): Promise<HintLadderState> {
    // Reload from persistent store to simulate a fresh chat/extension session
    this.cache = await this.store.loadAll();
    const ts = now ?? new Date().toISOString();
    const prev = this.cache[problemKey];
    if (!prev) {
      return createInitialHintLadderState(problemKey, this.defaultStrictness, ts);
    }

    const updated: HintLadderState = {
      ...prev,
      sessionReopenCount: prev.sessionReopenCount + 1,
      updatedAt: ts,
      history: [
        ...prev.history,
        {
          timestamp: ts,
          action: "reopen",
          fromLevel: prev.currentLevel,
          toLevel: prev.currentLevel,
          stuckCategory: prev.stuckCategory
        }
      ]
    };

    this.cache[problemKey] = updated;
    await this.store.saveAll(this.cache);
    return structuredClone(updated);
  }

  /**
   * Full explanation & code is unlocked ONLY on explicit user confirmation (`explicitConfirmation === true`).
   */
  public async unlockGiveUp(
    problemKey: string,
    explicitConfirmation: boolean,
    now?: string
  ): Promise<{ unlocked: boolean; state: HintLadderState }> {
    const states = await this.ensureLoaded();
    const ts = now ?? new Date().toISOString();
    const prev =
      states[problemKey] ??
      createInitialHintLadderState(problemKey, this.defaultStrictness, ts);

    if (!explicitConfirmation) {
      return {
        unlocked: prev.giveUpUnlocked,
        state: structuredClone(prev)
      };
    }

    const nextState: HintLadderState = {
      ...prev,
      giveUpUnlocked: true,
      giveUpUnlockedAt: prev.giveUpUnlockedAt ?? ts,
      updatedAt: ts,
      history: [
        ...prev.history,
        {
          timestamp: ts,
          action: "giveUp",
          fromLevel: prev.currentLevel,
          toLevel: prev.currentLevel,
          stuckCategory: prev.stuckCategory
        }
      ]
    };

    states[problemKey] = nextState;
    await this.store.saveAll(states);
    return {
      unlocked: true,
      state: structuredClone(nextState)
    };
  }

  public async setPreferences(
    problemKey: string,
    patch: { stuckCategory?: StuckCategory; strictness?: CoachStrictness },
    now?: string
  ): Promise<HintLadderState> {
    const states = await this.ensureLoaded();
    const ts = now ?? new Date().toISOString();
    const prev =
      states[problemKey] ??
      createInitialHintLadderState(problemKey, patch.strictness ?? this.defaultStrictness, ts);

    const nextState: HintLadderState = {
      ...prev,
      stuckCategory: patch.stuckCategory ?? prev.stuckCategory,
      strictness: patch.strictness ?? prev.strictness,
      updatedAt: ts
    };
    states[problemKey] = nextState;
    await this.store.saveAll(states);
    return structuredClone(nextState);
  }

  public async resetProblemState(problemKey: string): Promise<void> {
    const states = await this.ensureLoaded();
    delete states[problemKey];
    await this.store.saveAll(states);
  }

  private async ensureLoaded(): Promise<Record<string, HintLadderState>> {
    if (this.cache === null) {
      this.cache = await this.store.loadAll();
    }
    return this.cache;
  }
}

function createInitialHintLadderState(
  problemKey: string,
  strictness: CoachStrictness,
  now: string
): HintLadderState {
  return {
    problemKey,
    currentLevel: 0,
    hintsRequestedCount: 0,
    giveUpUnlocked: false,
    strictness,
    sessionReopenCount: 0,
    createdAt: now,
    updatedAt: now,
    history: []
  };
}
