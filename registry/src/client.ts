/** A registry entry (workflow or adapter). */
export interface RegistryEntry {
  name: string;
  type: "workflow" | "adapter";
  description: string;
  version: string;
  author: string;
  downloads: number;
  tags: string[];
  publishedAt: string;
}

/** Registry search results. */
export interface SearchResults {
  entries: RegistryEntry[];
  total: number;
  page: number;
}

const DEFAULT_REGISTRY_URL = "https://registry.dilipod.com/api/v1";

/**
 * Registry client — search, browse, and download community workflows and adapters.
 * Read-only in open source mode. No account required.
 */
export class RegistryClient {
  constructor(private baseUrl: string = DEFAULT_REGISTRY_URL) {}

  /** Search the registry. */
  async search(query: string, type?: "workflow" | "adapter"): Promise<SearchResults> {
    // TODO: HTTP request to registry API
    return { entries: [], total: 0, page: 1 };
  }

  /** Get a specific entry by name. */
  async get(name: string): Promise<RegistryEntry | null> {
    // TODO: HTTP request to registry API
    return null;
  }

  /** Download a workflow or adapter package. */
  async download(name: string, version?: string): Promise<Buffer> {
    // TODO: HTTP request to download endpoint
    throw new Error(`Download not yet implemented: ${name}@${version ?? "latest"}`);
  }
}
