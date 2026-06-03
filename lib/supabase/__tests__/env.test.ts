import { describe, it, expect, afterEach } from 'vitest';
import { supabaseUrl, supabaseAnonKey, supabaseServiceKey } from '../env';

const KEYS = [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];
function clear() { for (const k of KEYS) delete process.env[k]; }
afterEach(clear);

describe('supabase env resolver', () => {
  it('supabaseUrl: SUPABASE_URL tem precedência sobre NEXT_PUBLIC', () => {
    clear();
    process.env.SUPABASE_URL = 'http://local';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://cloud';
    expect(supabaseUrl()).toBe('http://local');
  });
  it('supabaseUrl: fallback p/ NEXT_PUBLIC quando SUPABASE_URL ausente', () => {
    clear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://cloud';
    expect(supabaseUrl()).toBe('http://cloud');
  });
  it('supabaseUrl: vazio quando nenhum setado', () => {
    clear();
    expect(supabaseUrl()).toBe('');
  });
  it('supabaseAnonKey: mesma precedência', () => {
    clear();
    process.env.SUPABASE_ANON_KEY = 'a';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'b';
    expect(supabaseAnonKey()).toBe('a');
  });
  it('supabaseServiceKey: só de SUPABASE_SERVICE_ROLE_KEY', () => {
    clear();
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
    expect(supabaseServiceKey()).toBe('svc');
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(supabaseServiceKey()).toBe('');
  });
});
