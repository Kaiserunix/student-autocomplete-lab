# Beta v2 Final Goals

Date: 2026-05-01

Status: target definition for the final beta before broader open-source feedback.

## 1. Inspiration From dot-skill

The `titanwings/colleague-skill` project is useful because it treats a person as an editable skill package instead of an opaque prompt blob. Its public `dot-skill` README describes a source-material pipeline, generated skill structure, incremental evolution, conversation correction, and version rollback.

For this project, the lesson is not to imitate a student's personality. The valuable idea is to distill a student's learning state into a local, inspectable, versioned teaching skill.

What to borrow:

- split stable capability knowledge from interaction style;
- use source quality rules, not all events equally;
- update skills by append-only evidence and explicit merge logic;
- keep corrections first-class, because the student can say "this diagnosis is wrong";
- version every skill update and support rollback.

What not to borrow directly:

- do not create a roleplay clone of the student;
- do not train on private material without local consent;
- do not let a distilled profile override current code evidence;
- do not make the profile invisible or impossible to edit.

## 2. Student Distillation

The beta v2 self-evolution unit is `Student Skill`.

It is a local skill file plus structured metadata generated from learning evidence. It should answer:

- What mistakes does this student repeatedly make?
- Which algorithm concepts are unstable?
- Which language or style habits should autocomplete preserve?
- Which hint style works without over-solving?
- Which previously learned skills transfer to unseen problems?

It should not answer:

- What is the full solution to the current problem?
- How can we replace the student's reasoning?
- How can we mimic the student's personality?

## 3. Student Skill Layers

The final beta should store the learner model in layers:

| Layer | Name | Purpose | Used By |
| --- | --- | --- | --- |
| 0 | Hard Rules | privacy, no full-solution autocomplete, language choice, disabled skills | all routes |
| 1 | Capability Map | topic level, solved topics, unstable topics | recommendation |
| 2 | Error Model | repeated pain points, confidence, examples, counterexamples | teacher diagnosis |
| 3 | Code Habits | input template, naming style, language idioms, formatting | autocomplete only |
| 4 | Teaching Preferences | preferred hint depth, examples vs formulas, Chinese wording | teacher UI |
| 5 | Transfer Evidence | unseen same-family probes, hint reduction, solved-after-hint evidence | promotion/demotion |
| 6 | Correction Log | user-marked wrong/helpful, manual notes, conflict decisions | merge and rollback |

Autocomplete may read only Layer 0 and Layer 3 plus local code context. It must not read full problem statements, Teacher Packs, or standard answers.

Teacher diagnosis may read all layers plus the current problem and Teacher Pack. It should still return one focused intervention by default.

## 4. Evidence Pipeline

The beta v2 pipeline should be:

1. `attemptEvent`: append-only record of problem, code snapshot, OJ/self-check result, hint count, abandon/reveal/AC state, token usage, and user feedback.
2. `teacherPack`: hidden problem reference with standard idea, expected complexity, invariants, pitfalls, counterexamples, and brute-force suitability.
3. `studentSkillPatch`: model-generated patch that proposes error-model updates, teaching preference updates, and recommendation changes.
4. `skillMerge`: additive merge that detects conflicts and never silently overwrites old conclusions.
5. `studentSkillVersion`: archived snapshot after each accepted merge, with rollback.
6. `transferValidation`: unseen same-family probe that checks whether a ready skill actually helps outside the original problem.

The key diagnostic comparison is:

```text
Teacher Pack expected model
minus
Student code and attempt evidence
minus
Student Skill history
= current student error model
```

This is the real "AI coach" value. It is more useful than simply asking a model to find a bug in wrong code.

## 5. Beta v2 Product Requirements

### Install and first run

- VSIX installs cleanly in a normal VS Code extension host.
- First screen is the AI coach surface, not a problem-bank admin page.
- Chinese UI is complete for the main flow.
- Model config supports OpenAI, OpenAI-compatible, and Anthropic-native modes.
- Public recommended routing is documented:
  - autocomplete: `dsv4f`;
  - analysis, scoring, optimization: `dsv4pro`;
  - MiMo: OpenAI-compatible experimental lane.

### Problem intake

- Paste problem text manually.
- Import Luogu problem by ID when the public endpoint works.
- Import/search Luogu problem sets as metadata.
- LeetCode remains paste/manual unless a stable adapter is added.
- Full statement import creates a starter source file after the user selects language: Python, C, C++, Rust, or other configured templates.
- Problem import should generate or refresh Teacher Pack in the background.

### AI coach loop

- `给点提示`: diagnose one current pain point and give one next step.
- `更具体`: deepen the same hint without jumping to full answer.
- `我放弃了`: create a lesson report, not just a stronger hint.
- `显示标准答案`: gated inside the lesson report.
- `我已完成`: archive the attempt and optionally skip explanation.
- `AC 后评分`: produce OJ result plus learning score.
- `优化算法`: after archive/AC, review complexity, memory, data structures, and whether optimization is unnecessary.

### Recommendation

- Recommend public problems first, based on pain point, topic, and difficulty.
- Use generated micro-drills only for 3-minute focused practice.
- Generated problems are marked synthetic and count less than public-problem success.
- Difficulty increases only after transfer evidence or repeated low-hint success.
- Repeated failure lowers or narrows the next recommendation instead of blindly increasing difficulty.

### Student Skill editor

- Show active skills, candidate skills, disabled skills, and recent evidence.
- Let the user mark a diagnosis helpful or wrong.
- Let the user disable or roll back a skill.
- Show why a recommendation was made.
- Record prompt/model token usage when providers return usage.

## 6. Beta v2 Engineering Requirements

- `StudentSkill` schema exists and is covered by tests.
- `studentSkillPatch` parser tolerates provider format drift.
- `skillMerge` is append-only, conflict-aware, and rollbackable.
- Teacher Pack generation is cached and never shown as the default answer.
- Autocomplete prompt builder has tests proving problem text is excluded.
- Model routing has tests for OpenAI, OpenAI-compatible, and Anthropic-native config.
- UI commands are separated into three surfaces:
  - problem paste/import/search;
  - AI interaction and current attempt;
  - archive, optimization, wrong problems, recommendation, and Student Skill.
- Runtime data stays out of git:
  - API keys;
  - `.runtime/`;
  - `.student-autocomplete/`;
  - raw personal learning ledgers;
  - bulk downloaded problem statements.

## 7. Beta v2 Evaluation Gates

The final beta is acceptable when these gates pass:

| Gate | Target |
| --- | ---: |
| `npm test` | pass |
| `npm run compile` | pass |
| VSIX package | generated and installable |
| Live model calls | 100+ without parser crash |
| Pain-point accuracy | >= 0.90 |
| Primary pain-point accuracy | >= 0.85 |
| Skill-candidate accuracy | >= 0.85 |
| Optimization verdict accuracy | >= 0.90 |
| Transfer pass rate on non-empty probes | >= 0.80 |
| Token usage tracking | provider usage recorded when available |
| Autocomplete leakage test | problem statement excluded |
| Student Skill rollback test | pass |
| Chinese main-flow UI | complete |

These metrics prove the coaching loop is stable enough for beta. They do not prove real human learning by themselves.

## 8. Human Inner-Test Gates

For personal beta, the user should be able to complete this loop:

1. install the VSIX;
2. configure one autocomplete model and one teacher model;
3. import or paste a Luogu problem;
4. create a source file from the problem;
5. write code with short autocomplete;
6. request at least one hint;
7. submit or self-check;
8. mark AC, WA, RE, TLE, or abandoned;
9. receive a lesson report or learning score;
10. archive the attempt;
11. inspect why the Student Skill changed;
12. receive a next-problem recommendation.

The inner test should include:

- 10 beginner input/output and array problems;
- 10 recursion/tree problems;
- at least 3 abandoned attempts;
- at least 5 AC-after-score reviews;
- at least 5 user feedback events, including one "diagnosis wrong" correction.

## 9. Beta v2 Non-Goals

- No bundled full public problem-bank dump.
- No CAPTCHA bypass, login bypass, or rate-limit evasion.
- No automatic OJ submission unless a legal and stable API is available.
- No claim that AI judging equals official OJ judging.
- No autonomous file editing by the teacher model.
- No cloud sync of student profiles in beta.
- No roleplay clone or personality imitation of the student.

## 10. Done Definition

Beta v2 is done when the extension behaves like an algorithm coach rather than a prompt toy:

- it helps the student move faster;
- it keeps autocomplete narrow;
- it uses stronger AI only after explicit teaching actions;
- it explains one pain point at a time;
- it scores AC by learning value, not only correctness;
- it recommends the next problem from evidence;
- it distills the student into a local, editable, rollbackable `Student Skill`;
- it can show enough test evidence that the loop survives real model calls.

