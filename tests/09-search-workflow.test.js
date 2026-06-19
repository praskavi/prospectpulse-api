import { describe, expect, it } from 'vitest';
import { hasFinalN8nResult } from '../src/services/searches.service.js';

describe('09 - Search workflow completion guards', () => {
  it('does not treat immediate n8n webhook acknowledgements as final search results', () => {
    expect(hasFinalN8nResult({ message: 'Workflow got started.' })).toBe(false);
    expect(hasFinalN8nResult({})).toBe(false);
  });

  it('treats explicit n8n result payloads as final, including zero-result successful searches', () => {
    expect(hasFinalN8nResult({ success: true, leads: [] })).toBe(true);
    expect(hasFinalN8nResult({ success: true, leads: [{ business_name: 'Acme' }] })).toBe(true);
  });
});
