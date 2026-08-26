import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isTokenSpam } from '../app/lib/utils.ts';

describe('Security & Blacklist Spam Detection', () => {
  const sampleBlacklist = [
    '0x000000000000000000000000000000000000dead',
    '0xSpamTokenContract1234567890abcdef12345678',
    'So11111111111111111111111111111111111111112' // example mint
  ];

  test('should detect blacklisted token address regardless of casing', () => {
    const isSpam = isTokenSpam(
      '0xspamtokencontract1234567890abcdef12345678',
      sampleBlacklist
    );
    assert.equal(isSpam, true);
  });

  test('should allow legitimate tokens not in the blacklist', () => {
    const isSpam = isTokenSpam(
      '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT
      sampleBlacklist
    );
    assert.equal(isSpam, false);
  });

  test('should never mark native coin (SOL/ETH/BNB) as spam', () => {
    const isSpam = isTokenSpam(
      '0x000000000000000000000000000000000000dead',
      sampleBlacklist,
      true // isNative = true
    );
    assert.equal(isSpam, false);
  });

  test('should treat empty or undefined token address as spam', () => {
    assert.equal(isTokenSpam('', sampleBlacklist), true);
  });
});
