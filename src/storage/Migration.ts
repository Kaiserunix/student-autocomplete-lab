export interface StorageMigrationResult {
  schema: string;
  changed: boolean;
  notes: string[];
}

export async function runNoopStorageMigration(schema: string): Promise<StorageMigrationResult> {
  return {
    schema,
    changed: false,
    notes: []
  };
}
