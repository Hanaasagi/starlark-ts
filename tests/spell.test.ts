import { nearest } from '../src/utils/spell';

var assert = require('assert');

describe('test spell', function() {
  it('test nearest 1', function() {
    assert.equal(nearest('rang', ['range', 'while', 'for', 'red']), 'range');
  });

  it('test nearest 2', function() {
    assert.equal(
      nearest('codePointat', ['codePoint', 'codePointAt', 'codePointAT']),
      'codePointAt'
    );
  });
});
