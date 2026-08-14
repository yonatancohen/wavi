import { describe, expect, it } from 'bun:test';
import { addPairSnippet } from '../relationships.js';

describe('addPairSnippet', () => {
  it('caps at 6 unique lines', () => {
    let snippets: string[] = [];
    for (let i = 1; i <= 8; i++) {
      snippets = addPairSnippet(snippets, `line ${i}`);
    }
    expect(snippets).toEqual(['line 1', 'line 2', 'line 3', 'line 4', 'line 5', 'line 6']);
  });

  it('does not add duplicates', () => {
    let snippets = addPairSnippet([], 'Alice: hello');
    snippets = addPairSnippet(snippets, 'Alice: hello');
    snippets = addPairSnippet(snippets, 'Bob: hi');
    expect(snippets).toEqual(['Alice: hello', 'Bob: hi']);
  });

  it('preserves insertion order', () => {
    let snippets = addPairSnippet([], 'c');
    snippets = addPairSnippet(snippets, 'a');
    snippets = addPairSnippet(snippets, 'b');
    expect(snippets).toEqual(['c', 'a', 'b']);
  });

  it('respects a custom max', () => {
    let snippets = addPairSnippet([], 'one', 2);
    snippets = addPairSnippet(snippets, 'two', 2);
    snippets = addPairSnippet(snippets, 'three', 2);
    expect(snippets).toEqual(['one', 'two']);
  });
});
