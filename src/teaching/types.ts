export interface TeachingProblemContext {
  id: string;
  title: string;
  summary: string;
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
}

export interface TeachingDiagnosisContext {
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  ojVerdict: OjVerdict;
  localEvidence: LocalEvidenceItem[];
  studentProfile: TeachingStudentProfileSummary;
}
