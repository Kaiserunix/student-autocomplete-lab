import type { OjProviderEntrypointV1, OjProviderManifestV1 } from "../../domain/oj/contracts";
import { ojProviderManifestSchema } from "../../domain/oj/providerManifest";
import { McpPlatformClient } from "./McpPlatformClient";
import type { McpConnectionFactory } from "./McpTransportFactory";

export class ProviderRegistry {
  private readonly manifests = new Map<string, OjProviderManifestV1>();
  private readonly clients = new Map<string, McpPlatformClient>();

  constructor(private readonly connectionFactory: McpConnectionFactory) {}

  register(input: OjProviderManifestV1): void {
    const manifest = ojProviderManifestSchema.parse(input) as OjProviderManifestV1;
    if (this.manifests.has(manifest.providerId)) {
      throw new Error(`Provider ${manifest.providerId} is already registered.`);
    }
    this.manifests.set(manifest.providerId, manifest);
  }

  async connect(providerId: string, entrypointId: OjProviderEntrypointV1["id"], signal?: AbortSignal): Promise<McpPlatformClient> {
    const manifest = this.manifests.get(providerId);
    if (!manifest) {
      throw new Error(`Provider ${providerId} is not registered.`);
    }
    const key = `${providerId}:${entrypointId}`;
    let client = this.clients.get(key);
    if (!client) {
      client = new McpPlatformClient({ manifest, entrypointId, connectionFactory: this.connectionFactory });
      this.clients.set(key, client);
    }
    await client.start(signal);
    return client;
  }

  async dispose(): Promise<void> {
    const clients = [...this.clients.values()];
    this.clients.clear();
    await Promise.all(clients.map((client) => client.close()));
  }
}
