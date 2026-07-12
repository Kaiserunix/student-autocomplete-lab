type AsyncLoader<T> = () => Promise<T>;

export interface ProblemBankStateDataLoaders<
  Problems,
  Completed,
  StudentSkill,
  AttemptSessions,
  AiStatus,
  AiConfig,
  InternalTesting
> {
  problems: AsyncLoader<Problems>;
  completed: AsyncLoader<Completed>;
  studentSkill: AsyncLoader<StudentSkill>;
  attemptSessions: AsyncLoader<AttemptSessions>;
  aiStatus: AsyncLoader<AiStatus>;
  aiConfig: AsyncLoader<AiConfig>;
  internalTesting: AsyncLoader<InternalTesting>;
}

export interface ProblemBankStateData<
  Problems,
  Completed,
  StudentSkill,
  AttemptSessions,
  AiStatus,
  AiConfig,
  InternalTesting
> {
  problems: Problems;
  completed: Completed;
  studentSkill: StudentSkill;
  attemptSessions: AttemptSessions;
  aiStatus: AiStatus;
  aiConfig: AiConfig;
  internalTesting: InternalTesting;
}

export async function loadProblemBankStateData<
  Problems,
  Completed,
  StudentSkill,
  AttemptSessions,
  AiStatus,
  AiConfig,
  InternalTesting
>(
  loaders: ProblemBankStateDataLoaders<
    Problems,
    Completed,
    StudentSkill,
    AttemptSessions,
    AiStatus,
    AiConfig,
    InternalTesting
  >
): Promise<
  ProblemBankStateData<
    Problems,
    Completed,
    StudentSkill,
    AttemptSessions,
    AiStatus,
    AiConfig,
    InternalTesting
  >
> {
  const [problems, completed, studentSkill, attemptSessions, aiStatus, aiConfig, internalTesting] =
    await Promise.all([
      loaders.problems(),
      loaders.completed(),
      loaders.studentSkill(),
      loaders.attemptSessions(),
      loaders.aiStatus(),
      loaders.aiConfig(),
      loaders.internalTesting()
    ]);

  return {
    problems,
    completed,
    studentSkill,
    attemptSessions,
    aiStatus,
    aiConfig,
    internalTesting
  };
}
