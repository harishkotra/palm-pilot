import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { chat, normaliseBaseUrl, DEFAULT_BASE_URL, type ChatTarget } from './llmClient';

export type LlmConfig = ChatTarget & { enabled: boolean };

export const DEFAULT_CONFIG: LlmConfig = {
  baseUrl: DEFAULT_BASE_URL,
  apiKey: '',
  model: 'gpt-4o-mini',
  enabled: false,
};

const STORE_KEY = 'palm-pilot.llm.v1';

let current: LlmConfig = DEFAULT_CONFIG;
const subs = new Set<(c: LlmConfig) => void>();

export async function loadConfig(): Promise<LlmConfig> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (raw) current = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return current;
}

export async function saveConfig(next: LlmConfig): Promise<LlmConfig> {
  current = { ...next, baseUrl: normaliseBaseUrl(next.baseUrl) };
  try {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(current));
  } catch {}
  subs.forEach((fn) => fn(current));
  return current;
}

export type ProbeResult = { ok: boolean; ms: number; text?: string; error?: string };

/** One tiny round-trip so the setup sheet can prove the endpoint answers. */
export async function probe(cfg: LlmConfig): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const reply = await chat(
      cfg,
      [
        { role: 'system', content: 'You are a connectivity check. Reply with exactly: ok' },
        { role: 'user', content: 'ping' },
      ],
      { maxTokens: 6, temperature: 0, timeoutMs: 15000 },
    );
    return { ok: true, ms: Date.now() - t0, text: reply.slice(0, 40) };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, error: e?.message ?? 'failed' };
  }
}

export function useLlm() {
  const [config, setConfig] = useState<LlmConfig>(current);

  useEffect(() => {
    let mounted = true;
    loadConfig().then((c) => mounted && setConfig(c));
    const fn = (c: LlmConfig) => setConfig(c);
    subs.add(fn);
    return () => {
      mounted = false;
      subs.delete(fn);
    };
  }, []);

  const save = useCallback(async (next: LlmConfig) => saveConfig(next), []);
  const live = config.enabled && !!config.model.trim();

  return { config, live, save, probe };
}
