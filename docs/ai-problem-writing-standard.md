# AI 写题 Markdown 规范

用途：让 AI 生成的题目保存为 `.md` 文件后，可以通过插件的“Markdown 文件导入”入口被解析为题面、输入格式、输出格式、样例、标签和难度。

````markdown
# 题目标题

- 难度: 1
- 标签: 输入输出, 字符串, 模拟

## 题面
用自然语言描述题目。不要把标准答案写在这里。

## 输入格式
说明每一行输入是什么、范围是什么。

## 输出格式
说明必须输出什么。强调不要输出“请输入”这类提示语。

## 样例 1
### 输入
```text
20 30
```
### 输出
```text
50
```

## 提示
只写给学生的读题提醒、边界提醒或常见坑，不写完整解法。
````

## 写题要求

- 题目必须自洽：输入范围、样例、输出格式不能互相矛盾。
- 样例输入和样例输出必须能人工验证。
- 题面只写题目要求，不写解法。
- 输出格式必须提醒竞赛题不能输出多余提示文字。
- 标签使用中文短标签，例如 `输入输出`、`数组`、`字符串`、`枚举`、`递归`、`二叉树`。
- 难度建议使用 `1` 到 `5`：1 为入门，5 为较难。
- 若是 3 分钟微练，题面要短，样例不超过 2 组。

## English Template

The importer also accepts common English contest-problem headings:

````markdown
# Problem Title

- Difficulty: 1
- Tags: input-output, string, simulation

## Problem Statement
Describe the task. Do not include the standard answer here.

## Input
Explain every input line and constraint.

## Output
Explain the exact required output. Remind the student not to print prompts such as `please input`.

## Example 1
### Input
```text
20 30
```
### Output
```text
50
```

## Constraints
Write constraints or contest-output reminders.

## Notes
Write reading hints or common pitfalls, not a full solution.
````

## 可选紧凑样例格式

插件也支持这种格式：

````markdown
## 样例输入 1
```text
20 30
```

## 样例输出 1
```text
50
```
````
