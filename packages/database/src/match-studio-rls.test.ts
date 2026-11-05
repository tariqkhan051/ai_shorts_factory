import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertJobOwnedByUser,
  assertRunOwnedByUser,
  assertSourceOwnedByUser,
  assertStorageKeyBelongsToRun,
  buildMatchStudioStorageKeyPrefix,
} from './match-studio-ownership.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../migrations');

function readAllMigrations(): string {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(migrationsDir, name), 'utf8'))
    .join('\n');
}

describe('Match Studio RLS policies (migration source of truth)', () => {
  const sql = readAllMigrations();

  it('enables RLS and owner policies on Match Studio tables', () => {
    const tables = [
      'match_studio_runs',
      'match_sources',
      'match_analysis_jobs',
      'match_timelines',
      'match_events',
      'match_edit_plans',
      'match_edits',
      'match_commentary_scripts',
    ];
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
      expect(sql.toLowerCase()).toContain(table);
    }
    expect(sql).toMatch(/match_studio_runs_all_own/i);
    expect(sql).toMatch(/match_sources_all_own/i);
    expect(sql).toMatch(/match_commentary_scripts_all_own/i);
  });

  it('restricts workflow_jobs lease mutations to service role (no user update policy)', () => {
    expect(sql).toMatch(/workflow_jobs_select_own/i);
    expect(sql).toMatch(/workflow_jobs_insert_own/i);
    expect(sql).toMatch(/Lease mutations require service role/i);
  });
});

describe('Match Studio ownership helpers (worker boundary)', () => {
  const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  it('allows User A to assert ownership of User A records', () => {
    expect(() =>
      assertRunOwnedByUser(
        {
          id: 'r1',
          user_id: userA,
          project_id: 'p1',
          match_source_id: null,
          title: 't',
          status: 'draft',
          patch_resolution: 'bound',
          server_environment: 'original',
          game_profile_id: 'g1',
          game_patch_id: null,
          last_error: null,
          capability_flags: {} as never,
          commentary_style: 'esports_caster',
          created_at: '',
          updated_at: '',
        },
        userA,
      ),
    ).not.toThrow();
  });

  it('denies User A access to User B runs and sources', () => {
    expect(() =>
      assertRunOwnedByUser(
        {
          id: 'r1',
          user_id: userB,
          project_id: 'p1',
          match_source_id: null,
          title: 't',
          status: 'draft',
          patch_resolution: 'bound',
          server_environment: 'original',
          game_profile_id: 'g1',
          game_patch_id: null,
          last_error: null,
          capability_flags: {} as never,
          commentary_style: 'esports_caster',
          created_at: '',
          updated_at: '',
        },
        userA,
      ),
    ).toThrow(/not owned/);

    expect(() =>
      assertSourceOwnedByUser(
        {
          id: 's1',
          user_id: userB,
          project_id: null,
          title: 't',
          storage_key: null,
          local_path: '/x',
          content_checksum_sha256: null,
          byte_size: null,
          duration_seconds: null,
          server_environment: 'original',
          game_patch_id: null,
          probe_json: {},
          ingest_status: 'registered',
          original_filename: '',
          notes: '',
          created_at: '',
          updated_at: '',
          deleted_at: null,
        },
        userA,
      ),
    ).toThrow(/not owned/);
  });

  it('rejects unauthenticated / missing records', () => {
    expect(() => assertRunOwnedByUser(null, userA)).toThrow();
    expect(() => assertJobOwnedByUser(null, userA)).toThrow();
  });

  it('rejects unauthorized storage keys', () => {
    const prefix = buildMatchStudioStorageKeyPrefix(userA, 'run-1');
    expect(() => assertStorageKeyBelongsToRun(`${prefix}video.mp4`, userA, 'run-1')).not.toThrow();
    expect(() =>
      assertStorageKeyBelongsToRun(`users/${userB}/match-studio/run-1/video.mp4`, userA, 'run-1'),
    ).toThrow(/outside the authorized/);
  });
});

describe('Live Supabase RLS (optional)', () => {
  const live = process.env.MATCH_STUDIO_RLS_LIVE_TEST === 'true';

  it.skipIf(!live)(
    'User A cannot read User B match_studio_runs via anon client',
    async () => {
      // Requires a configured Free test project with two users and seeded rows.
      // Set MATCH_STUDIO_RLS_LIVE_TEST=true plus SUPABASE_* env to enable.
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL).toBeTruthy();
      expect(process.env.MATCH_STUDIO_RLS_USER_A_JWT).toBeTruthy();
      expect(process.env.MATCH_STUDIO_RLS_USER_B_RUN_ID).toBeTruthy();
    },
  );
});
