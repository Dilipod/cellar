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
  private baseUrl: string;

  constructor(baseUrl: string = DEFAULT_REGISTRY_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /** Search the registry. */
  async search(query: string, type?: "workflow" | "adapter", page = 1): Promise<SearchResults> {
    const params = new URLSearchParams({ q: query, page: String(page) });
    if (type) params.set("type", type);

    const url = `${this.baseUrl}/search?${params}`;
    const resp = await this.fetch(url);

    if (!resp.ok) {
      return { entries: [], total: 0, page };
    }

    return resp.json() as Promise<SearchResults>;
  }

  /** Get a specific entry by name. */
  async get(name: string): Promise<RegistryEntry | null> {
    const url = `${this.baseUrl}/packages/${encodeURIComponent(name)}`;
    const resp = await this.fetch(url);

    if (!resp.ok) return null;
    return resp.json() as Promise<RegistryEntry>;
  }

  /** Download a workflow or adapter package. Returns the package as a buffer. */
  async download(name: string, version?: string): Promise<Buffer> {
    const ver = version ?? "latest";
    const url = `${this.baseUrl}/packages/${encodeURIComponent(name)}/download?version=${ver}`;
    const resp = await this.fetch(url);

    if (!resp.ok) {
      throw new Error(`Download failed: ${name}@${ver} — HTTP ${resp.status}`);
    }

    const arrayBuffer = await resp.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /** List popular/featured entries. */
  async featured(type?: "workflow" | "adapter"): Promise<RegistryEntry[]> {
    const params = new URLSearchParams();
    if (type) params.set("type", type);

    const url = `${this.baseUrl}/featured?${params}`;
    const resp = await this.fetch(url);

    if (!resp.ok) return [];
    const data = (await resp.json()) as { entries: RegistryEntry[] };
    return data.entries ?? [];
  }

  /** Check if the registry is reachable. */
  async ping(): Promise<boolean> {
    try {
      const resp = await this.fetch(`${this.baseUrl}/health`, { timeout: 5000 });
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** Internal fetch with error handling and timeout. */
  private async fetch(
    url: string,
    options: { timeout?: number } = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = options.timeout ?? 15000;
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await globalThis.fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "cellar-cli/0.1.0",
        },
        signal: controller.signal,
      });
      return resp;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Registry request timed out: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
