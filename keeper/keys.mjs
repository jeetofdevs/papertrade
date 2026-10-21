// The keeper's NEAR key, derived from a secret phrase (KEEPER_SEED).
// The same phrase in GitHub (deploy) and on the keeper server gives the same key, so the
// private key itself never has to be copied around.

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { baseEncode, KeyPair } from 'near-api-js';

/** Methods the keeper key may call on the pool contract. It cannot move funds. */
export const KEEPER_METHODS = ['push_prices', 'run_keeper', 'credit_transfers', 'credit_near_transfers'];

export function keeperKeyPair(seed) {
  if (!seed || seed.length < 16) throw new Error('KEEPER_SEED must be at least 16 characters');
  const secret = sha256(new TextEncoder().encode(`nitro-keeper:${seed}`));
  const pub = ed25519.getPublicKey(secret);
  const full = new Uint8Array(64);
  full.set(secret);
  full.set(pub, 32);
  return KeyPair.fromString(`ed25519:${baseEncode(full)}`);
}
