// Every value the app uses comes from here and nowhere else. Set them in .env.
// EXPO_PUBLIC_* is inlined into the JS bundle at build time, so this file is the
// single source of truth — and the reason a shipped build must not carry a key.

const str = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim() : fallback);

export const LLM = {
  baseUrl: str(process.env.EXPO_PUBLIC_LLM_BASE_URL, 'https://api.particle.ai/v1'),
  apiKey: str(process.env.EXPO_PUBLIC_LLM_API_KEY, ''),
  model: str(process.env.EXPO_PUBLIC_LLM_MODEL, 'particle-1'),
  reasoningEffort: str(process.env.EXPO_PUBLIC_LLM_REASONING_EFFORT, 'none'),
  maxTokens: Number(str(process.env.EXPO_PUBLIC_LLM_MAX_TOKENS, '200')) || 200,
};

export const GITHUB = {
  repo: str(process.env.EXPO_PUBLIC_GITHUB_REPO, ''),
  token: str(process.env.EXPO_PUBLIC_GITHUB_TOKEN, ''),
  api: str(process.env.EXPO_PUBLIC_GITHUB_API, 'https://api.github.com'),
};

/** Gestures are the input. This only exists for demoing on a device with no sensor. */
export const DEBUG_GESTURES = str(process.env.EXPO_PUBLIC_DEBUG_GESTURES, '0') === '1';

export const hasKey = LLM.apiKey.length > 8;
export const hasRepo = GITHUB.repo.length > 2 && GITHUB.token.length > 10;
