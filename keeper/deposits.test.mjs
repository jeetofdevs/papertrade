import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoAccount, needsClose, parseDeposits, toPrice8 } from './deposits.mjs';

const cfg = { pool: 'nitro.near', usdc: 'usdc.near' };
const ev = (data) => `EVENT_JSON:${JSON.stringify({ standard: 'nep141', version: '1.0.0', event: 'ft_transfer', data })}`;
const tx = (outcomes) => ({ transaction: { hash: 'H1' }, receipts_outcome: outcomes });
const rc = (id, executor_id, logs, status = { SuccessValue: '' }) => ({ id, outcome: { executor_id, logs, status } });

test('plain transfer is credited to the sender', () => {
  const r = parseDeposits(tx([rc('R1', 'usdc.near', [ev([{ old_owner_id: 'bob.near', new_owner_id: 'nitro.near', amount: '5000000' }])])]), cfg);
  assert.deepEqual(r, [{ key: 'H1:R1:0:0', account: 'bob.near', amount: '5000000' }]);
});

test('memo names the account to credit', () => {
  const r = parseDeposits(
    tx([rc('R1', 'usdc.near', [ev([{ old_owner_id: 'binance-hot.near', new_owner_id: 'nitro.near', amount: '7', memo: ' Nitro:Alice.near ' }])])]),
    cfg,
  );
  assert.equal(r[0].account, 'alice.near');
});

test('bad memo falls back to the sender', () => {
  const r = parseDeposits(tx([rc('R1', 'usdc.near', [ev([{ old_owner_id: 'bob.near', new_owner_id: 'nitro.near', amount: '7', memo: 'thanks!!' }])])]), cfg);
  assert.equal(r[0].account, 'bob.near');
});

test('ft_transfer_call deposits are skipped', () => {
  const r = parseDeposits(
    tx([
      rc('R1', 'usdc.near', [ev([{ old_owner_id: 'bob.near', new_owner_id: 'nitro.near', amount: '5' }])]),
      rc('R2', 'nitro.near', ['EVENT_JSON:{"event":"deposit"}']),
    ]),
    cfg,
  );
  assert.deepEqual(r, []);
});

test('failed receipts, other tokens and other receivers are ignored', () => {
  const r = parseDeposits(
    tx([
      rc('R1', 'usdc.near', [ev([{ old_owner_id: 'a.near', new_owner_id: 'nitro.near', amount: '5' }])], { Failure: {} }),
      rc('R2', 'fake.near', [ev([{ old_owner_id: 'a.near', new_owner_id: 'nitro.near', amount: '5' }])]),
      rc('R3', 'usdc.near', [ev([{ old_owner_id: 'a.near', new_owner_id: 'other.near', amount: '5' }])]),
      rc('R4', 'usdc.near', ['not json', 'EVENT_JSON:{broken']),
    ]),
    cfg,
  );
  assert.deepEqual(r, []);
});

test('memo validation', () => {
  assert.equal(memoAccount('alice.near'), 'alice.near');
  assert.equal(memoAccount('a'), null);
  assert.equal(memoAccount('has space.near'), null);
  assert.equal(memoAccount(undefined), null);
  assert.equal(memoAccount('17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1'), '17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1');
});

test('prices convert to 8 decimals exactly', () => {
  assert.equal(toPrice8('3.1415'), 314150000n);
  assert.equal(toPrice8('97000.123456789'), 9700012345678n);
  assert.equal(toPrice8('2'), 200000000n);
  assert.throws(() => toPrice8('1e5'));
});

test('close checks', () => {
  const long = { long: true, liq: '297000000', tp: '303000000' };
  assert.equal(needsClose(long, 300000000n), false);
  assert.equal(needsClose(long, 297000000n), true);
  assert.equal(needsClose(long, 303000001n), true);
  const short = { long: false, liq: '303000000', tp: null };
  assert.equal(needsClose(short, 250000000n), false);
  assert.equal(needsClose(short, 303000000n), true);
});
