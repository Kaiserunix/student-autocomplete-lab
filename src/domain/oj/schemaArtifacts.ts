import { z } from "zod";
import { ojSchemaRegistry } from "./schemas";

export function buildOjSchemaArtifacts(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ojSchemaRegistry)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, schema]) => {
        const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
        return [`${name}.schema.json`, `${JSON.stringify(sortJson(jsonSchema), null, 2)}\n`];
      })
  );
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJson(nested)])
    );
  }
  return value;
}
