// A stand-in for the GitHub REST API calls the app makes, over an in-memory
// repository. Test-only: never bundled into the app.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export function gitSha(text: string): string {
  const bytes = Buffer.from(text, 'utf8');
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** The hand-written sample vault in tests/sample-vault. */
export function sampleVault(): Record<string, string> {
  const root = new URL('../../../tests/sample-vault/', import.meta.url).pathname;
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files[relative(root, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(root);
  return files;
}

export interface Call {
  method: string;
  path: string;
  body?: { message?: string; content?: string; sha?: string; branch?: string };
}

export class FakeGitHub {
  files: Map<string, string>;
  calls: Call[] = [];
  /** Respond to the next matching calls with this status instead. */
  failures: { method: string; pathIncludes: string; status: number; times: number }[] = [];
  offline = false;
  token = 'test-token';

  constructor(
    files: Record<string, string>,
    readonly owner = 'reader',
    readonly repo = 'vault',
    readonly branch = 'main',
  ) {
    this.files = new Map(Object.entries(files));
  }

  get treeSha(): string {
    return gitSha([...this.files].map(([p, t]) => `${p}:${gitSha(t)}`).sort().join('\n'));
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    if (this.offline) throw new TypeError('Failed to fetch');
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    const prefix = `/repos/${this.owner}/${this.repo}`;
    const path = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : url.pathname;
    this.calls.push({ method, path: path + url.search, body });

    const auth = new Headers(init.headers).get('Authorization');
    if (auth !== `Bearer ${this.token}`) return json(401, { message: 'Bad credentials' });
    if (url.hostname !== 'api.github.com' || !url.pathname.startsWith(prefix)) return json(404, { message: 'Not Found' });

    const failure = this.failures.find((f) => f.method === method && path.includes(f.pathIncludes) && f.times > 0);
    if (failure) {
      failure.times--;
      return json(failure.status, { message: 'Injected failure' });
    }

    if (method === 'GET' && path === '') return json(200, { default_branch: this.branch, private: true });
    if (method === 'GET' && path === `/git/trees/${this.branch}`) {
      const tree = [...this.files].map(([p, t]) => ({ path: p, type: 'blob', sha: gitSha(t), size: t.length }));
      return json(200, { sha: this.treeSha, tree, truncated: false });
    }
    if (method === 'GET' && path.startsWith('/git/blobs/')) {
      const sha = path.slice('/git/blobs/'.length);
      const text = [...this.files.values()].find((t) => gitSha(t) === sha);
      if (text == null) return json(404, { message: 'Not Found' });
      return json(200, { sha, content: Buffer.from(text, 'utf8').toString('base64'), encoding: 'base64' });
    }
    if (path.startsWith('/contents/')) {
      const filePath = decodeURIComponent(path.slice('/contents/'.length));
      if (method === 'PUT') {
        if (this.files.has(filePath)) return json(422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
        const text = Buffer.from(body.content, 'base64').toString('utf8');
        this.files.set(filePath, text);
        return json(201, { content: { path: filePath, sha: gitSha(text) }, commit: { sha: 'c0ffee' } });
      }
      if (method === 'DELETE') {
        const text = this.files.get(filePath);
        if (text == null) return json(404, { message: 'Not Found' });
        if (gitSha(text) !== body.sha) return json(409, { message: 'does not match' });
        this.files.delete(filePath);
        return json(200, { commit: { sha: 'c0ffee' } });
      }
    }
    return json(404, { message: 'Not Found' });
  };

  /** What the curator would do: file the note, then delete it. */
  process(path: string, changes: Record<string, string | null> = {}) {
    this.files.delete(path);
    for (const [p, text] of Object.entries(changes)) {
      if (text == null) this.files.delete(p);
      else this.files.set(p, text);
    }
  }

  inbox(): string[] {
    return [...this.files.keys()].filter((p) => p.startsWith('inbox/')).sort();
  }
}

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
