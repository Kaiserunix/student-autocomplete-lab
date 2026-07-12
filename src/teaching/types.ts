export interface TeachingProblemContext {
  id: string;
  title: string;
  summary: string;
}

export interface TeacherPackPitfall {
  label: string;
  description: string;
}

export interface TeacherPackCounterexample {
  input: string;
  expectedOutput: string;
  reason: string;
}

export interface TeacherPackBruteForce {
  suitable: boolean;
  acceptableComplexity?: string;
  reason: string;
}

export interface TeacherPackReference {
  summary: string;
  constraints: string;
  standardApproach: string;
  expectedAlgorithm: string;
  expectedComplexity: {
    time: string;
    space: string;
  };
  keyInvariants: string[];
  commonPitfalls: TeacherPackPitfall[];
  minimalCounterexamples: TeacherPackCounterexample[];
  bruteForce: TeacherPackBruteForce;
}

export interface OjVerdict {
  status: "AC" | "WA" | "RE" | "TLE" | "MLE" | "UNKNOWN";
  passedTests?: number;
  totalTests?: number;
}

export interface LocalEvidenceItem {
  note: string;
  expectedOutput: string;
  actualOutput: string;
  stderr: string;
  passed: boolean;
}

export interface TeachingStudentProfileSummary {
  painPointCounts: Record<string, number>;
  activeSkills?: string[];
  recentCorrections?: Array<{
    type: string;
    target?: string;
    note: string;
  }>;
}

export interface TeachingDiagnosisContext {
  problem: TeachingProblemContext;
  teacherPack?: TeacherPackReference;
  language: string;
  studentCode: string;
  ojVerdict: OjVerdict;
  localEvidence: LocalEvidenceItem[];
  studentProfile: TeachingStudentProfileSummary;
  responseLanguage?: "zh-CN" | "en-US" | "raw";
}
