use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const USDC: u128 = 1_000_000; // 1 USDC in base units
const P: u128 = PRICE_DECIMALS;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}

struct T {
    c: Contract,
    now: u64,
}

impl T {
    /// User asks to withdraw, owner approves. Returns the request id.
    fn withdraw_approved(&mut self, who: &str, usdc: u128) -> u64 {
        self.as_(who);
        let id = self.c.request_withdraw(U128(usdc * USDC));
        self.as_("owner.near");
        let _ = self.c.approve_withdraw(id);
        id
    }
    fn new() -> Self {
        let mut t = T { c: Contract::new(acc("owner.near"), acc("usdc.near"), acc("oracle.near")), now: 1_000 * NANOS };
        t.as_("owner.near");
        t
    }
    fn as_(&mut self, who: &str) -> &mut Self {
        let ctx = VMContextBuilder::new()
            .current_account_id(acc("nitro.near"))
            .predecessor_account_id(acc(who))
            .block_timestamp(self.now)
            .build();
        testing_env!(ctx);
        self
    }
    fn deposit(&mut self, who: &str, usdc: u128, msg: &str) {
        self.as_("usdc.near");
        let _ = self.c.ft_on_transfer(acc(who), U128(usdc * USDC), msg.into());
    }
    fn price(&mut self, market: &str, price: u128) {
        self.as_("oracle.near");
        self.c.push_prices(vec![(market.into(), U128(price))]);
    }
    fn balance(&self, who: &str) -> u128 {
        self.c.get_account(acc(who)).balance.0
    }
    fn later(&mut self, secs: u64) {
        self.now += secs * NANOS;
    }
}

fn setup() -> T {
    let mut t = T::new();
    t.deposit("lp.near", 1_000_000, "vault"); // $1M vault
    t.deposit("alice.near", 1_000, "");
    t.price("NEAR", 3 * P);
    t
}

#[test]
fn deposits_credit_balance_and_vault() {
    let t = setup();
    assert_eq!(t.balance("alice.near"), 1_000 * USDC);
    let v = t.c.get_vault();
    assert_eq!(v.liquidity.0, 1_000_000 * USDC);
    assert_eq!(t.c.get_account(acc("lp.near")).vault_shares.0, 1_000_000 * USDC);
}

#[test]
#[should_panic(expected = "Only USDC is accepted")]
fn rejects_other_tokens() {
    let mut t = setup();
    t.as_("fake-usdc.near");
    let _ = t.c.ft_on_transfer(acc("alice.near"), U128(5), "".into());
}

#[test]
fn win_is_paid_from_vault_minus_fee() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 10, None, None);
    assert_eq!(t.balance("alice.near"), 900 * USDC);
    t.later(5);
    t.price("NEAR", 3_150_000_00 / 1 * 1); // $3.15 (+5%)
    t.as_("alice.near");
    let r = t.c.close_position(id, None);
    // +5% at 10x = +50% of the wager = $50 profit, 10% fee = $5
    assert_eq!(r.pnl, (50 * USDC).to_string());
    assert_eq!(r.fee.0, 5 * USDC);
    assert_eq!(t.balance("alice.near"), 1_045 * USDC);
    let v = t.c.get_vault();
    assert_eq!(v.liquidity.0, 1_000_000 * USDC - 50 * USDC);
    assert_eq!(v.fees.0, 5 * USDC);
    assert_eq!(v.reserved.0, 0);
}

#[test]
fn loss_goes_to_vault_and_mints_nitro() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 10, None, None);
    t.price("NEAR", 2_940_000_00); // -2% at 10x = -20%
    t.as_("alice.near");
    t.c.close_position(id, None);
    assert_eq!(t.balance("alice.near"), 980 * USDC);
    assert_eq!(t.c.get_vault().liquidity.0, 1_000_020 * USDC);
    assert_eq!(t.c.get_account(acc("alice.near")).nitro.0, 20 * USDC * 10);
}

#[test]
fn keeper_closes_at_max_loss_price() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), false, U128(10 * USDC), 1000, None, None);
    let pos = t.c.get_position(id).unwrap();
    assert_eq!(pos.liq.0, 3 * P * 1001 / 1000);
    t.price("NEAR", 3_010_000_00); // +0.33%, far past max loss for a 1000x short
    t.as_("keeper.near");
    let out = t.c.run_keeper(vec![id, 999]);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].reason, "max_loss");
    assert_eq!(out[0].pnl, (-(10 * USDC as i128)).to_string());
    assert_eq!(t.balance("alice.near"), 990 * USDC);
    assert!(t.c.get_position(id).is_none());
}

#[test]
fn take_profit_settles_at_tp_price_even_after_overshoot() {
    let mut t = setup();
    t.as_("alice.near");
    // +100% on the wager at 100x = +1% move
    let id = t.c.open_position("NEAR".into(), true, U128(10 * USDC), 100, Some(10_000), None);
    assert_eq!(t.c.get_position(id).unwrap().tp.unwrap().0, 3 * P * 10_100 / 10_000);
    t.price("NEAR", 3_100_000_00); // +3.3%, overshoots the TP
    t.as_("anyone.near");
    let out = t.c.run_keeper(vec![id]);
    assert_eq!(out[0].reason, "take_profit");
    assert_eq!(out[0].pnl, (10 * USDC).to_string());
    assert_eq!(t.balance("alice.near"), 990 * USDC + 20 * USDC - USDC); // wager back + $10 profit - $1 fee
}

#[test]
fn profit_is_capped_at_reserved_payout() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(10 * USDC), 1000, None, None);
    t.price("NEAR", 6 * P); // +100% at 1000x would be absurd; cap is 10x wager
    t.as_("alice.near");
    let r = t.c.close_position(id, None);
    assert_eq!(r.pnl, (100 * USDC).to_string());
}

#[test]
#[should_panic(expected = "Position too large for the vault")]
fn caps_position_size() {
    let mut t = setup();
    t.as_("alice.near");
    // 2% of $1M = $20K max size; $100 at 1000x = $100K
    t.c.open_position("NEAR".into(), true, U128(100 * USDC), 1000, None, None);
}

#[test]
#[should_panic(expected = "Price is stale")]
fn refuses_stale_prices() {
    let mut t = setup();
    t.later(60);
    t.as_("alice.near");
    t.c.open_position("NEAR".into(), true, U128(10 * USDC), 10, None, None);
}

#[test]
#[should_panic(expected = "reserved for open positions")]
fn lp_cannot_withdraw_reserved_liquidity() {
    let mut t = T::new();
    t.deposit("lp.near", 100_000, "vault");
    t.deposit("alice.near", 1_000, "");
    t.price("NEAR", 3 * P);
    t.as_("alice.near");
    t.c.open_position("NEAR".into(), true, U128(200 * USDC), 10, None, None); // reserves $2,000
    t.as_("lp.near");
    let _ = t.c.vault_withdraw(U128(100_000 * USDC));
}

#[test]
fn lp_share_price_rises_when_traders_lose() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 10, None, None);
    t.price("NEAR", 2 * P);
    t.as_("keeper.near");
    t.c.run_keeper(vec![id]);
    t.deposit("bob.near", 1_000_100, "vault");
    // Bob paid $1,000,100 into a $1,000,100 vault, so he owns half the shares.
    let bob = t.c.get_account(acc("bob.near")).vault_shares.0;
    let lp = t.c.get_account(acc("lp.near")).vault_shares.0;
    assert_eq!(bob, lp);
}

#[test]
#[should_panic(expected = "Not your position")]
fn cannot_close_someone_elses_position() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(10 * USDC), 10, None, None);
    t.as_("mallory.near");
    t.c.close_position(id, None);
}

#[test]
#[should_panic(expected = "Only the owner")]
fn only_owner_can_change_config() {
    let mut t = setup();
    t.as_("alice.near");
    let c = t.c.get_config();
    t.c.set_config(c);
}

#[test]
fn owner_cannot_take_more_than_fees() {
    let mut t = setup();
    t.as_("owner.near");
    let r = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let _ = t.c.withdraw_fees(U128(1));
    }));
    assert!(r.is_err());
}

#[test]
fn withdraw_failure_refunds_balance() {
    let mut t = setup();
    t.withdraw_approved("alice.near", 100);
    assert_eq!(t.balance("alice.near"), 900 * USDC);
    t.as_("nitro.near");
    t.c.on_withdraw(acc("alice.near"), U128(100 * USDC), Err(PromiseError::Failed));
    assert_eq!(t.balance("alice.near"), 1_000 * USDC);
}

fn credit(key: &str, who: &str, usdc: u128) -> TransferCredit {
    TransferCredit { key: key.into(), account: acc(who), amount: U128(usdc * USDC) }
}

impl T {
    /// Run the credit flow with the contract holding `held` USDC on the token contract.
    fn credit(&mut self, credits: Vec<TransferCredit>, held: u128) -> Vec<String> {
        self.as_("oracle.near");
        let _ = self.c.credit_transfers(credits.clone());
        let seq = self.c.out_seq;
        self.as_("nitro.near");
        self.c.on_credit_balance(credits, seq, Ok(U128(held * USDC)))
    }
}

#[test]
fn plain_transfer_is_credited_once() {
    let mut t = setup(); // contract holds $1,001,000 that is already owed
    let done = t.credit(vec![credit("tx1:r1:0", "bob.near", 50)], 1_001_050);
    assert_eq!(done, vec!["tx1:r1:0".to_string()]);
    assert_eq!(t.balance("bob.near"), 50 * USDC);
    assert!(t.c.is_credited("tx1:r1:0".into()));
    // The same transfer again does nothing.
    let done = t.credit(vec![credit("tx1:r1:0", "bob.near", 50)], 1_001_050);
    assert!(done.is_empty());
    assert_eq!(t.balance("bob.near"), 50 * USDC);
    assert_eq!(t.c.get_pool().accounted.0, 1_001_050 * USDC);
}

#[test]
fn credits_never_exceed_unassigned_usdc() {
    let mut t = setup();
    // Only $30 arrived, but the indexer claims $50 + $20.
    let done = t.credit(vec![credit("a", "bob.near", 50), credit("b", "carol.near", 20)], 1_001_030);
    assert_eq!(done, vec!["b".to_string()]);
    assert_eq!(t.balance("bob.near"), 0);
    assert_eq!(t.balance("carol.near"), 20 * USDC);
}

#[test]
fn credit_check_that_raced_a_withdrawal_is_dropped() {
    let mut t = setup();
    t.as_("oracle.near");
    let credits = vec![credit("x", "bob.near", 100)];
    let _ = t.c.credit_transfers(credits.clone());
    let seq = t.c.out_seq;
    t.withdraw_approved("alice.near", 100);
    t.as_("nitro.near");
    t.c.on_withdraw(acc("alice.near"), U128(100 * USDC), Ok(()));
    // Balance was read before Alice's $100 left, so it looks like $100 is unassigned. It is not.
    let done = t.c.on_credit_balance(credits, seq, Ok(U128(1_001_000 * USDC)));
    assert!(done.is_empty());
    assert_eq!(t.balance("bob.near"), 0);
}

#[test]
fn withdrawals_keep_the_books_balanced() {
    let mut t = setup();
    t.withdraw_approved("alice.near", 100);
    let p = t.c.get_pool();
    assert_eq!(p.accounted.0, 1_000_900 * USDC);
    assert_eq!(p.in_flight.0, 100 * USDC);
    t.as_("nitro.near");
    t.c.on_withdraw(acc("alice.near"), U128(100 * USDC), Ok(()));
    let p = t.c.get_pool();
    assert_eq!(p.accounted.0, 1_000_900 * USDC);
    assert_eq!(p.in_flight.0, 0);
}

#[test]
#[should_panic(expected = "Only the oracle can credit transfers")]
fn only_oracle_can_credit() {
    let mut t = setup();
    t.as_("alice.near");
    let _ = t.c.credit_transfers(vec![credit("k", "alice.near", 1)]);
}

#[test]
fn keeper_can_list_open_positions() {
    let mut t = setup();
    t.as_("alice.near");
    let a = t.c.open_position("NEAR".into(), true, U128(10 * USDC), 10, None, None);
    let b = t.c.open_position("NEAR".into(), false, U128(10 * USDC), 10, None, None);
    t.c.close_position(a, None);
    let open = t.c.get_open_positions(0, 100);
    assert_eq!(open.len(), 1);
    assert_eq!(open[0].id, b);
}

#[test]
fn every_deposit_withdraw_and_trade_is_recorded_per_user() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 10, None, None);
    t.price("NEAR", 3_150_000_00);
    t.as_("alice.near");
    t.c.close_position(id, None);
    t.withdraw_approved("alice.near", 45);
    let l = t.c.get_ledger(acc("alice.near"), None, None);
    let kinds: Vec<&str> = l.iter().map(|e| e.kind.as_str()).collect();
    assert_eq!(kinds, vec!["withdraw", "withdraw_request", "close", "open", "deposit"]); // newest first
    assert_eq!(l[0].amount.0, 45 * USDC);
    assert_eq!(l[2].pnl.as_deref(), Some("50000000"));
    assert_eq!(l[2].amount.0, 145 * USDC); // wager + profit - fee
    assert_eq!(l[3].leverage, Some(10));
    assert_eq!(l[4].amount.0, 1_000 * USDC);
    let a = t.c.get_account(acc("alice.near"));
    assert_eq!(a.total_deposited.0, 1_000 * USDC);
    assert_eq!(a.total_withdrawn.0, 45 * USDC);
    assert_eq!(a.volume.0, 1_000 * USDC);
    assert_eq!(a.profit.0, 45 * USDC);
    assert_eq!(a.trades, 1);
    // Other users' history is separate.
    assert_eq!(t.c.get_ledger(acc("lp.near"), None, None)[0].kind, "vault_deposit");
}

#[test]
fn history_keeps_the_latest_entries() {
    let mut t = setup();
    for _ in 0..(LEDGER_MAX + 5) {
        t.deposit("alice.near", 1, "");
    }
    let all = t.c.get_ledger(acc("alice.near"), Some(0), Some(500));
    assert_eq!(all.len(), 100);
    assert_eq!(t.c.get_ledger(acc("alice.near"), Some(98), Some(10)).len(), 2);
}

#[test]
#[should_panic(expected = "slippage limit")]
fn open_respects_slippage_limit() {
    let mut t = setup();
    t.as_("alice.near");
    // Long, but the trader will not pay more than $2.99.
    t.c.open_position("NEAR".into(), true, U128(10 * USDC), 10, None, Some(U128(2_990_000_00)));
}

#[test]
#[should_panic(expected = "slippage limit")]
fn close_respects_slippage_limit() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(10 * USDC), 10, None, None);
    t.price("NEAR", 2_950_000_00);
    t.as_("alice.near");
    t.c.close_position(id, Some(U128(2_980_000_00)));
}

#[test]
fn spread_moves_entry_and_exit_against_the_trader() {
    let mut t = setup();
    t.as_("owner.near");
    let mut c = t.c.get_config();
    c.spread_bps = 10; // 0.1%
    t.c.set_config(c);
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 1, None, Some(U128(3_003_000_00)));
    assert_eq!(t.c.get_position(id).unwrap().entry.0, 3_003_000_00);
    let r = t.c.close_position(id, None);
    assert_eq!(r.exit.0, 2_997_000_00);
    assert!(r.pnl.starts_with('-'));
}

#[test]
#[should_panic(expected = "Deposit below the minimum")]
fn tiny_deposits_are_refused() {
    let mut t = setup();
    t.as_("usdc.near");
    let _ = t.c.ft_on_transfer(acc("bob.near"), U128(10), "".into());
}

#[test]
fn withdrawals_wait_for_owner_review() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.request_withdraw(U128(300 * USDC));
    // Locked, not sent yet.
    let a = t.c.get_account(acc("alice.near"));
    assert_eq!(a.balance.0, 700 * USDC);
    assert_eq!(a.pending_withdraw.0, 300 * USDC);
    assert_eq!(t.c.get_pool().in_flight.0, 0);
    let reqs = t.c.get_withdraw_requests(None, None);
    assert_eq!(reqs.len(), 1);
    assert_eq!(reqs[0].account, acc("alice.near"));
    // Owner approves: USDC goes out.
    t.as_("owner.near");
    let _ = t.c.approve_withdraw(id);
    let a = t.c.get_account(acc("alice.near"));
    assert_eq!(a.pending_withdraw.0, 0);
    assert_eq!(a.total_withdrawn.0, 300 * USDC);
    assert_eq!(t.c.get_pool().in_flight.0, 300 * USDC);
    assert!(t.c.get_withdraw_requests(None, None).is_empty());
}

#[test]
fn rejected_or_cancelled_withdrawals_return_to_balance() {
    let mut t = setup();
    t.as_("alice.near");
    let a = t.c.request_withdraw(U128(100 * USDC));
    let b = t.c.request_withdraw(U128(50 * USDC));
    t.as_("owner.near");
    t.c.reject_withdraw(a, Some("Please verify your account".into()));
    t.as_("alice.near");
    t.c.cancel_withdraw(b);
    assert_eq!(t.balance("alice.near"), 1_000 * USDC);
    assert_eq!(t.c.get_account(acc("alice.near")).pending_withdraw.0, 0);
    let l = t.c.get_ledger(acc("alice.near"), None, Some(2));
    assert_eq!(l[0].kind, "withdraw_cancelled");
    assert_eq!(l[1].kind, "withdraw_rejected");
    assert_eq!(l[1].reason.as_deref(), Some("Please verify your account"));
}

#[test]
#[should_panic(expected = "Only the owner")]
fn only_owner_approves_withdrawals() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.request_withdraw(U128(10 * USDC));
    let _ = t.c.approve_withdraw(id);
}

#[test]
#[should_panic(expected = "Not your request")]
fn cannot_cancel_someone_elses_request() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.request_withdraw(U128(10 * USDC));
    t.as_("mallory.near");
    t.c.cancel_withdraw(id);
}

#[test]
#[should_panic(expected = "Not enough free balance")]
fn cannot_request_more_than_balance() {
    let mut t = setup();
    t.as_("alice.near");
    t.c.request_withdraw(U128(1_001 * USDC));
}

fn promo_setup() -> T {
    let mut t = setup(); // default promo cap: 300 USDC
    t.deposit("bob.near", 2, "");
    t
}

#[test]
fn bonus_needs_a_deposit_and_is_claimed_once() {
    let mut t = promo_setup();
    assert_eq!(t.c.get_promo().budget.0, 300 * USDC);
    t.as_("bob.near");
    assert_eq!(t.c.claim_promo("bob_x".into()).0, 3 * USDC);
    let a = t.c.get_account(acc("bob.near"));
    assert_eq!(a.balance.0, 5 * USDC);
    assert_eq!(a.promo_wager_required.0, 60 * USDC);
    assert_eq!(t.c.get_promo().budget.0, 297 * USDC);
    assert_eq!(t.c.get_ledger(acc("bob.near"), None, Some(1))[0].kind, "promo_bonus");
    // Paid from the vault; no USDC came in, so the books still balance.
    assert_eq!(t.c.get_vault().liquidity.0, (1_000_000 - 3) * USDC);
    assert_eq!(t.c.get_pool().accounted.0, (1_000_000 + 1_000 + 2) * USDC);
    assert_eq!(t.c.get_account(acc("bob.near")).x_handle.as_deref(), Some("bob_x"));
}

#[test]
#[should_panic(expected = "already claimed")]
fn bonus_only_once() {
    let mut t = promo_setup();
    t.as_("bob.near");
    t.c.claim_promo("bob_x".into());
    t.c.claim_promo("bob_x".into());
}

#[test]
#[should_panic(expected = "Deposit the minimum first")]
fn bonus_needs_min_deposit() {
    let mut t = promo_setup();
    t.deposit("carol.near", 1, "");
    t.as_("carol.near");
    t.c.claim_promo("bob_x".into());
}

#[test]
#[should_panic(expected = "fully claimed")]
fn bonus_respects_the_cap() {
    let mut t = setup();
    t.as_("owner.near");
    t.c.set_promo_budget(U128(0));
    t.deposit("bob.near", 2, "");
    t.as_("bob.near");
    t.c.claim_promo("bob_x".into());
}

#[test]
#[should_panic(expected = "team wallet")]
fn owner_cannot_claim_the_bonus() {
    let mut t = setup();
    t.deposit("owner.near", 5, "");
    t.as_("owner.near");
    t.c.claim_promo("dev".into());
}

#[test]
#[should_panic(expected = "Enter your X username")]
fn bonus_needs_an_x_username() {
    let mut t = promo_setup();
    t.as_("bob.near");
    t.c.claim_promo("not a handle!".into());
}

#[test]
fn x_username_accepts_the_at_sign() {
    let mut t = promo_setup();
    t.as_("bob.near");
    t.c.claim_promo(" @Bob_X ".into());
    assert_eq!(t.c.get_account(acc("bob.near")).x_handle.as_deref(), Some("Bob_X"));
}

#[test]
#[should_panic(expected = "bonus is still locked")]
fn withdrawals_locked_until_turnover() {
    let mut t = promo_setup();
    t.as_("bob.near");
    t.c.claim_promo("bob_x".into());
    t.c.request_withdraw(U128(USDC));
}

#[test]
fn turnover_unlocks_withdrawals_and_quick_flips_do_not_count() {
    let mut t = promo_setup();
    t.deposit("bob.near", 100, "");
    t.as_("bob.near");
    t.c.claim_promo("bob_x".into());
    // Opened and closed within the same minute: does not count.
    let id = t.c.open_position("NEAR".into(), true, U128(50 * USDC), 1, None, None);
    t.later(10);
    t.price("NEAR", 3 * P);
    t.as_("bob.near");
    t.c.close_position(id, None);
    assert_eq!(t.c.get_account(acc("bob.near")).promo_wagered.0, 0);
    // Held for over a minute: counts. Two of them reach $60.
    for _ in 0..2 {
        t.as_("bob.near");
        let id = t.c.open_position("NEAR".into(), true, U128(30 * USDC), 1, None, None);
        t.later(61);
        t.price("NEAR", 3 * P);
        t.as_("bob.near");
        t.c.close_position(id, None);
    }
    let a = t.c.get_account(acc("bob.near"));
    assert_eq!(a.promo_wager_required.0, 0);
    assert_eq!(a.promo_bonus.0, 0);
    assert_eq!(t.c.get_ledger(acc("bob.near"), None, Some(1))[0].kind, "promo_unlocked");
    t.c.request_withdraw(U128(USDC)); // unlocked
}

#[test]
fn bonus_ends_when_the_balance_is_gone() {
    let mut t = promo_setup();
    t.as_("bob.near");
    t.c.claim_promo("bob_x".into());
    let id = t.c.open_position("NEAR".into(), true, U128(5 * USDC), 1000, None, None);
    t.later(5);
    t.price("NEAR", 2 * P);
    t.as_("keeper.near");
    t.c.run_keeper(vec![id]);
    let a = t.c.get_account(acc("bob.near"));
    assert_eq!(a.balance.0, 0);
    assert_eq!(a.promo_wager_required.0, 0);
    assert_eq!(t.c.get_ledger(acc("bob.near"), None, Some(1))[0].kind, "promo_ended");
}

#[test]
fn leaderboard_lists_every_user_once() {
    let mut t = setup(); // lp + alice
    t.deposit("alice.near", 5, "");
    t.deposit("bob.near", 2, "");
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 10, None, None);
    t.price("NEAR", 3_150_000_00);
    t.as_("alice.near");
    t.c.close_position(id, None);
    assert_eq!(t.c.get_user_count(), 3);
    let all = t.c.get_users_stats(None, None);
    let names: Vec<String> = all.iter().map(|u| u.account.to_string()).collect();
    assert_eq!(names, vec!["lp.near", "alice.near", "bob.near"]);
    assert_eq!(all[1].volume.0, 1_000 * USDC);
    assert_eq!(all[1].profit.0, 45 * USDC);
    assert_eq!(all[1].trades, 1);
    assert_eq!(t.c.get_users_stats(Some(2), Some(5)).len(), 1);
}

#[test]
fn nitro_total_counts_only_real_losses() {
    let mut t = setup();
    assert_eq!(t.c.get_nitro().total_minted.0, 0);
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 10, None, None);
    t.price("NEAR", 2_940_000_00);
    t.as_("alice.near");
    t.c.close_position(id, None);
    assert_eq!(t.c.get_nitro().total_minted.0, 20 * USDC * 10);
}

#[test]
#[should_panic(expected = "Conversion opens at the $NITRO token launch")]
fn conversion_is_closed_until_launch() {
    let mut t = setup();
    t.as_("alice.near");
    let _ = t.c.convert_nitro(U128(1));
}

#[test]
fn conversion_spends_points_and_refunds_on_failure() {
    let mut t = setup();
    t.as_("alice.near");
    let id = t.c.open_position("NEAR".into(), true, U128(100 * USDC), 10, None, None);
    t.price("NEAR", 2_940_000_00);
    t.as_("alice.near");
    t.c.close_position(id, None); // 200 NITRO points
    t.as_("owner.near");
    t.c.set_nitro_conversion(Some(acc("nitro-token.near")), U128(1_000_000_000_000_000_000), true); // 1 token (18 dp) per point
    t.as_("alice.near");
    let _ = t.c.convert_nitro(U128(50 * USDC));
    assert_eq!(t.c.get_account(acc("alice.near")).nitro.0, 150 * USDC);
    assert_eq!(t.c.get_nitro().total_converted.0, 50 * USDC);
    t.as_("nitro.near");
    t.c.on_convert(acc("alice.near"), U128(50 * USDC), Err(PromiseError::Failed));
    assert_eq!(t.c.get_account(acc("alice.near")).nitro.0, 200 * USDC);
    assert_eq!(t.c.get_nitro().total_converted.0, 0);
}

#[test]
#[should_panic(expected = "Set the token and rate")]
fn conversion_needs_token_and_rate() {
    let mut t = setup();
    t.as_("owner.near");
    t.c.set_nitro_conversion(None, U128(0), true);
}

#[test]
#[should_panic(expected = "Deposit above the maximum")]
fn deposits_above_1000_are_refused() {
    let mut t = setup();
    t.as_("usdc.near");
    let _ = t.c.ft_on_transfer(acc("bob.near"), U128(1_001 * USDC), "".into());
}

#[test]
fn a_1000_deposit_is_fine() {
    let mut t = setup();
    t.deposit("bob.near", 1_000, "");
    assert_eq!(t.balance("bob.near"), 1_000 * USDC);
}
