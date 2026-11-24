// The vault on GitHub, through the REST API with a fine-grained token that
// can read and write only that repository. The token stays on the phone.

const API = 'https://api.github.com';

export interface VaultRepo {
  owner: string;
  repo: string;
  token: string;
}

export interface TreeEntry {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }

  /** Worth trying again later, unchanged: offline, rate-limited or a server hiccup. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 409 || this.status === 429 || this.status >= 500 || /hourly limit/.test(this.message);
  }
}

/** "owner/repo", or a pasted github.com URL. */
export function parseRepo(value: string): { owner: string; repo: string } | null {
  const m = /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/.exec(value.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

export class GitHub {
  constructor(private readonly ref: VaultRepo) {}

  private get base(): string {
    return `${API}/repos/${encodeURIComponent(this.ref.owner)}/${encodeURIComponent(this.ref.repo)}`;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(this.base + path, {
        ...init,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${this.ref.token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new GitHubError(0, 'GitHub is out of reach. The phone may be offline.');
    }
    if (!response.ok) throw new GitHubError(response.status, await explain(response));
    return response;
  }

  /** The repository's default branch. */
  async branch(): Promise<string> {
    const data = (await (await this.call('', { cache: 'no-cache' })).json()) as { default_branch: string };
    return data.default_branch;
  }

  /** Every path in the branch, with blob shas. Revalidated, so an unchanged vault costs no rate limit. */
  async tree(branch: string): Promise<{ sha: string; entries: TreeEntry[]; truncated: boolean }> {
    const data = (await (await this.call(`/git/trees/${encodeURIComponent(branch)}?recursive=1`, { cache: 'no-cache' })).json()) as {
      sha: string;
      tree: TreeEntry[];
      truncated: boolean;
    };
    return { sha: data.sha, entries: data.tree, truncated: data.truncated };
  }

  async blob(sha: string): Promise<string> {
    const data = (await (await this.call(`/git/blobs/${sha}`)).json()) as { content: string; encoding: string };
    return data.encoding === 'base64' ? fromBase64(data.content) : data.content;
  }

  /** Creates a file. Fails with 422 if the path is taken. */
  async create(path: string, content: string, message: string, branch: string): Promise<{ sha: string }> {
    const response = await this.call(`/contents/${encodePath(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64(content), branch }),
    });
    const data = (await response.json()) as { content: { sha: string } };
    return { sha: data.content.sha };
  }

  /** Deletes a file, if it is still the version with this sha. */
  async remove(path: string, sha: string, message: string, branch: string): Promise<void> {
    await this.call(`/contents/${encodePath(path)}`, {
      method: 'DELETE',
      body: JSON.stringify({ message, sha, branch }),
    });
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function explain(response: Response): Promise<string> {
  let detail = '';
  try {
    detail = ((await response.json()) as { message?: string }).message ?? '';
  } catch {
    // Not JSON.
  }
  switch (response.status) {
    case 401:
      return 'GitHub refused the token. It may have expired or been revoked: make a new one in Settings.';
    case 403:
    case 429:
      if (response.headers.get('x-ratelimit-remaining') === '0') {
        const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
        const at = reset ? new Date(reset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'later';
        return `GitHub's hourly limit is used up. It resets at ${at}.`;
      }
      return 'The token isn\'t allowed to do this. It needs Contents: Read and write for the vault repository.';
    case 404:
      return 'GitHub can\'t find the vault. Check the repository name, and that the token includes it.';
    default:
      return `GitHub answered ${response.status}${detail ? `: ${detail}` : ''}.`;
  }
}

export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(base64: string): string {
  const binary = atob(base64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
