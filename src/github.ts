// Real GitHub reads. Nothing here is cached or typed in by hand: the app asks
// api.github.com what is actually open on the repo named in .env.

import { GITHUB } from './config';

export type GhRepo = {
  fullName: string;
  description: string;
  stars: number;
  openIssues: number;
  language: string;
  pushedAt: string;
  branch: string;
};

export type GhIssue = {
  number: number;
  title: string;
  labels: string[];
  comments: number;
  updatedAt: string;
  isPR: boolean;
};

export type GhCommit = { sha: string; msg: string; author: string; at: string };

export type RepoState = { repo: GhRepo; issues: GhIssue[]; commits: GhCommit[]; ms: number };

export class GhError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.name = 'GhError';
    this.status = status;
  }
}

async function get(path: string): Promise<any> {
  const res = await fetch(`${GITHUB.api.replace(/\/+$/, '')}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 160);
    try {
      msg = JSON.parse(text)?.message ?? msg;
    } catch {
      /* raw */
    }
    throw new GhError(res.status, msg);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new GhError(0, 'GitHub returned non-JSON');
  }
}

const short = (s: string, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export async function fetchRepoState(repo = GITHUB.repo): Promise<RepoState> {
  const t0 = Date.now();
  const [meta, issues, commits] = await Promise.all([
    get(`/repos/${repo}`),
    get(`/repos/${repo}/issues?state=open&sort=updated&direction=desc&per_page=25`),
    get(`/repos/${repo}/commits?per_page=12`),
  ]);

  return {
    repo: {
      fullName: meta.full_name,
      description: short(meta.description ?? '', 120),
      stars: meta.stargazers_count ?? 0,
      openIssues: meta.open_issues_count ?? 0,
      language: meta.language ?? '—',
      pushedAt: meta.pushed_at ?? '',
      branch: meta.default_branch ?? 'main',
    },
    issues: (Array.isArray(issues) ? issues : []).map((i: any) => ({
      number: i.number,
      title: short(i.title, 90),
      labels: (i.labels ?? []).map((l: any) => (typeof l === 'string' ? l : l.name)).slice(0, 3),
      comments: i.comments ?? 0,
      updatedAt: i.updated_at ?? '',
      isPR: !!i.pull_request,
    })),
    commits: (Array.isArray(commits) ? commits : []).map((c: any) => ({
      sha: (c.sha ?? '').slice(0, 7),
      msg: short(c.commit?.message ?? '', 90),
      author: c.author?.login ?? c.commit?.author?.name ?? 'someone',
      at: c.commit?.author?.date ?? '',
    })),
    ms: Date.now() - t0,
  };
}

/** Human phrasing for how stale the repo is, computed from the real push date. */
export function sincePushed(pushedAt: string): string {
  const t = Date.parse(pushedAt);
  if (!Number.isFinite(t)) return 'unknown';
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
