/**
 * Unit tests for the ResolverEntry / unwrapResolver mechanism.
 *
 * Verifies the conditional-injection plumbing added in T2 (v1.45.0.0).
 * Plain functions still work; gated entries skip when appliesTo returns false.
 */

import { describe, test, expect } from 'bun:test';
import { unwrapResolver, type ResolverFn, type ResolverEntry, type TemplateContext } from '../scripts/resolvers/types';

function makeCtx(overrides: Partial<TemplateContext> = {}): TemplateContext {
  return {
    skillName: 'test-skill',
    tmplPath: '/tmp/test/SKILL.md.tmpl',
    host: 'claude',
    paths: {
      skillRoot: '~/.claude/skills/gstack',
      localSkillRoot: '.claude/skills',
      binDir: '~/.claude/skills/gstack/bin',
      browseDir: '~/.claude/skills/gstack/browse/dist',
      designDir: '~/.claude/skills/gstack/design/dist',
      makePdfDir: '~/.claude/skills/gstack/make-pdf/dist',
    },
    ...overrides,
  };
}

describe('unwrapResolver — plain function pass-through', () => {
  test('returns the function as-is, no gate', () => {
    const fn: ResolverFn = (ctx) => `hello-${ctx.skillName}`;
    const { resolve, appliesTo } = unwrapResolver(fn);
    expect(resolve(makeCtx())).toBe('hello-test-skill');
    expect(appliesTo).toBeUndefined();
  });
});

describe('unwrapResolver — gated entry', () => {
  test('returns resolve + gate', () => {
    const entry: ResolverEntry = {
      resolve: (ctx) => `gated-${ctx.skillName}`,
      appliesTo: (ctx) => ['ship', 'review'].includes(ctx.skillName),
    };
    const { resolve, appliesTo } = unwrapResolver(entry);
    expect(resolve(makeCtx({ skillName: 'ship' }))).toBe('gated-ship');
    expect(appliesTo!(makeCtx({ skillName: 'ship' }))).toBe(true);
    expect(appliesTo!(makeCtx({ skillName: 'qa' }))).toBe(false);
  });

  test('gate returning false should signal skip — gen-skill-docs substitutes empty string', () => {
    // This mirrors the gen-skill-docs.ts contract:
    //   if (appliesTo && !appliesTo(ctx)) return '';
    const entry: ResolverEntry = {
      resolve: () => 'CONTENT',
      appliesTo: () => false,
    };
    const { resolve, appliesTo } = unwrapResolver(entry);
    const result = appliesTo && !appliesTo(makeCtx()) ? '' : resolve(makeCtx());
    expect(result).toBe('');
  });

  test('gate returning true allows resolve to fire', () => {
    const entry: ResolverEntry = {
      resolve: () => 'CONTENT',
      appliesTo: () => true,
    };
    const { resolve, appliesTo } = unwrapResolver(entry);
    const result = appliesTo && !appliesTo(makeCtx()) ? '' : resolve(makeCtx());
    expect(result).toBe('CONTENT');
  });

  test('entry without appliesTo behaves like ungated', () => {
    const entry: ResolverEntry = { resolve: () => 'ALWAYS' };
    const { resolve, appliesTo } = unwrapResolver(entry);
    expect(appliesTo).toBeUndefined();
    expect(resolve(makeCtx())).toBe('ALWAYS');
  });
});

describe('RESOLVERS registry still loads with mixed shapes', () => {
  test('importing the live registry produces a record with expected resolvers', async () => {
    const { RESOLVERS } = await import('../scripts/resolvers/index');
    // Spot-check that core resolvers are present.
    expect(RESOLVERS.PREAMBLE).toBeDefined();
    expect(RESOLVERS.REVIEW_DASHBOARD).toBeDefined();
    expect(RESOLVERS.SLUG_EVAL).toBeDefined();
    // Each entry should unwrap cleanly.
    for (const [name, entry] of Object.entries(RESOLVERS)) {
      const { resolve } = unwrapResolver(entry);
      expect(typeof resolve).toBe('function');
      expect(name.length).toBeGreaterThan(0);
    }
  });
});
