import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSupabaseConfig,
  describeSupabaseReadiness,
  getSupabasePublicConfig,
  isSupabaseConfigured,
  readDatabaseEnv,
} from './config.js';

const ORIGINAL = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL);
});

describe('readDatabaseEnv / Supabase foundation', () => {
  it('defaults to memory when Supabase is unset', () => {
    delete process.env.PROJECT_STORE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    const env = readDatabaseEnv(process.env);
    expect(env.store).toBe('memory');
    expect(isSupabaseConfigured(process.env)).toBe(false);
    expect(getSupabasePublicConfig(process.env)).toBeNull();
  });

  it('accepts SUPABASE_PUBLISHABLE_KEY alias', () => {
    process.env.PROJECT_STORE = 'supabase';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'pub-key';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    const publicConfig = getSupabasePublicConfig(process.env);
    expect(publicConfig).toEqual({
      url: 'https://example.supabase.co',
      anonKey: 'pub-key',
    });
  });

  it('assertSupabaseConfig fails closed for service role', () => {
    process.env.PROJECT_STORE = 'supabase';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() =>
      assertSupabaseConfig(process.env, {
        requireServiceRole: true,
        purpose: 'test',
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('describeSupabaseReadiness hints missing DB URL', () => {
    process.env.PROJECT_STORE = 'supabase';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
    delete process.env.SUPABASE_DB_URL;
    delete process.env.DATABASE_URL;
    const readiness = describeSupabaseReadiness(process.env);
    expect(readiness.publicConfigured).toBe(true);
    expect(readiness.serviceConfigured).toBe(true);
    expect(readiness.dbUrlConfigured).toBe(false);
    expect(readiness.actionableHint).toMatch(/SUPABASE_DB_URL/);
  });

  it('does not require Supabase when store is memory', () => {
    process.env.PROJECT_STORE = 'memory';
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const readiness = describeSupabaseReadiness(process.env);
    expect(readiness.store).toBe('memory');
    expect(readiness.actionableHint).toBeNull();
  });
});
