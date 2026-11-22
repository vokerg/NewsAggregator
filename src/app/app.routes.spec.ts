import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';

describe('App routing', () => {
  it('loads the news page lazily and provides an unknown-path fallback', () => {
    expect(routes.find((route) => route.path === 'news')?.loadComponent).toBeTypeOf(
      'function',
    );
    expect(routes.find((route) => route.path === '**')?.redirectTo).toBe('news');
  });
});
