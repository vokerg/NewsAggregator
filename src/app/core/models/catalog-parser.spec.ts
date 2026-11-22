import { describe, expect, it } from 'vitest';
import { parseCatalog } from './catalog-parser';

const article = {
  id: 'dk-example-1',
  title: 'Example headline',
  source_id: 'dk-example',
  source_name: 'Example publisher',
  original_url: 'https://example.org/article',
  published_at: null,
  first_seen_at: '2026-11-18T08:00:00Z',
  perspective_ids: ['dk-media'],
  about_country_codes: ['UA'],
  extraction_status: 'unavailable',
};

describe('parseCatalog', () => {
  it('validates an empty versioned catalog', () => {
    expect(parseCatalog({ schema_version: 1, revision: 'empty', items: [] }).items).toEqual([]);
  });

  it('preserves VIEW FROM separately from ABOUT and original publisher URLs', () => {
    const result = parseCatalog({ schema_version: 1, revision: 'v1', items: [article] });
    expect(result.items[0]?.perspective_ids).toEqual(['dk-media']);
    expect(result.items[0]?.about_country_codes).toEqual(['UA']);
    expect(result.items[0]?.original_url).toBe('https://example.org/article');
    expect(result.items[0]?.published_at).toBeNull();
  });

  it('rejects unsupported versions and malformed data', () => {
    expect(() => parseCatalog({ schema_version: 2, revision: 'v2', items: [] })).toThrow();
    expect(() => parseCatalog({ schema_version: 1, revision: 'v1', items: [{}] })).toThrow();
    expect(() =>
      parseCatalog({
        schema_version: 1,
        revision: 'v1',
        items: [{ ...article, original_url: 'javascript:alert(1)' }],
      }),
    ).toThrow();
  });
});
