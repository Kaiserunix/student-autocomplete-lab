export function stableAutocompleteFileLabel(filePath: string): string {
  const parts = filePath
    .split(/[\\/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  let practiceIndex = -1;
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    if (parts[index].toLowerCase() === "practice") {
      practiceIndex = index;
      break;
    }
  }
  if (practiceIndex >= 0 && parts.length > practiceIndex + 1) {
    const platform = sanitizePart(parts[practiceIndex + 1]);
    const extension = fileExtension(parts.at(-1) ?? "");
    return ["practice", platform || "source", "problem" + extension].join("/");
  }

  const fileName = parts.at(-1);
  if (
    fileName &&
    /^(?:[A-Za-z]+\d+[A-Za-z0-9_-]*|\d+)\.[A-Za-z0-9]+$/.test(fileName)
  ) {
    return "problem" + fileExtension(fileName);
  }
  return parts.slice(-2).map(sanitizePart).join("/") || "current-file";
}

function sanitizePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "") || "path";
}

function fileExtension(fileName: string): string {
  const match = fileName.match(/(\.[A-Za-z0-9]+)$/);
  return match ? match[1] : "";
}
