import type { ProblemRecord } from "../problemBank/types";
import type {
  OjVerdict,
  TeacherPackReference,
  TeachingDiagnosisContext,
  TeachingStudentProfileSummary
} from "../teaching/types";

interface SidebarTeachingContextInput {
  problem: ProblemRecord;
  language: string;
  studentCode: string;
  profileSummary: TeachingStudentProfileSummary;
  teacherPack?: TeacherPackReference;
  ojVerdict?: OjVerdict;
  requestPurpose?: string;
  responseLanguage?: "zh-CN" | "en-US" | "raw";
}

const SUMMARY_LIMIT = 3600;
const CODE_LIMIT = 12000;

export function summarizeProblemForTeaching(problem: ProblemRecord, requestPurpose?: string): string {
  const summary = [
    requestPurpose ? `学生请求：${requestPurpose}` : "",
    problem.tags.length > 0 ? `标签：${problem.tags.join("，")}` : "",
    problem.statement ? `题面：\n${problem.statement}` : "",
    problem.inputFormat ? `输入格式：\n${problem.inputFormat}` : "",
    problem.outputFormat ? `输出格式：\n${problem.outputFormat}` : "",
    problem.samples.length > 0 ? summarizeSamples(problem) : "",
    problem.hint ? `题目提示：\n${problem.hint}` : ""
  ]
    .filter((section) => section.length > 0)
    .join("\n\n");

  return clip(summary, SUMMARY_LIMIT);
}

export function buildSidebarTeachingContext(input: SidebarTeachingContextInput): TeachingDiagnosisContext {
  return {
    problem: {
      id: input.problem.id,
      title: input.problem.title,
      summary: summarizeProblemForTeaching(input.problem, input.requestPurpose)
    },
    teacherPack: input.teacherPack,
    language: input.language,
    studentCode: clip(input.studentCode, CODE_LIMIT),
    ojVerdict: input.ojVerdict ?? {
      status: "UNKNOWN"
    },
    localEvidence: [],
    studentProfile: input.profileSummary,
    responseLanguage: input.responseLanguage
  };
}

function summarizeSamples(problem: ProblemRecord): string {
  return problem.samples
    .slice(0, 2)
    .map((sample, index) =>
      [`样例输入 ${index + 1}：\n${sample.input}`, `样例输出 ${index + 1}：\n${sample.output}`].join("\n")
    )
    .join("\n\n");
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  return `${text.slice(0, limit)}\n[已截断，避免一次提示消耗过多上下文]`;
}
