//! Nitro vault: wager-based perpetuals on NEAR, settled in USDC against a shared vault.
//!
//! - Traders deposit USDC (NEP-141) with `ft_transfer_call` (msg "") and trade from that balance.
//! - Liquidity providers deposit with msg "vault" and receive vault shares.
//! - A position's wager is its maximum loss. It closes at the max loss price (100% of the wager),
//!   at its take profit price, or when the owner closes it.
//! - Every open position reserves its maximum payout in the vault, so winners are always paid and
//!   liquidity providers cannot withdraw funds that open positions may need.
//! - Prices come from a trusted oracle account (the keeper) and must be fresh.
//! - The contract account is also the pool's deposit address. A plain USDC `ft_transfer` to it
//!   (for example from a wallet app) is picked up by the indexer (the oracle account) and credited
//!   to the sender, or to the NEAR account written in the transfer memo. Each transfer is credited
//!   once, and credits can never exceed the USDC the contract holds but has not yet assigned.
//! - The contract owner can tune limits, pause new positions and collect protocol fees, but cannot
//!   move trader balances or vault liquidity.

use near_sdk::json_types::U128;
use near_sdk::store::{IterableMap, LookupMap, LookupSet, Vector};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};

/// Prices use 8 decimals.
pub const PRICE_DECIMALS: u128 = 100_000_000;
const BPS: u128 = 10_000;
const NANOS: u64 = 1_000_000_000;
/// Each user keeps their most recent history entries on chain.
pub const LEDGER_MAX: usize = 100;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub max_leverage: u32,
    /// Minimum wager in USDC base units (6 decimals).
    pub min_wager: U128,
    /// A position's size is capped at this share of vault liquidity.
    pub max_position_bps: u32,
    /// Profit per position is capped at this multiple of the wager.
    pub max_profit_multiple: u32,
    /// Fee taken from profits, in basis points.
    pub profit_fee_bps: u32,
    /// Prices older than this cannot be used.
    pub max_price_age_sec: u64,
    pub max_open_positions: u32,
    /// NITRO points (6 decimals) minted per 1 USDC lost.
    pub nitro_per_usdc: u32,
    pub markets: Vec<String>,
    /// Price spread charged on opens and closes, in basis points (0 = trade at the oracle price).
    pub spread_bps: u32,
    /// Smallest trading deposit, in USDC base units.
    pub min_deposit: U128,
    /// Largest single trading deposit, in USDC base units (0 = no limit).
    pub max_deposit: U128,
    /// Slippage on opens and closes, in parts per million: a base amount plus price impact that
    /// grows with the position size (reaching `slippage_impact_ppm` at the largest allowed size).
    pub slippage_base_ppm: u32,
    pub slippage_impact_ppm: u32,
    /// New-user bonus credited by `claim_promo` (0 turns the promo off).
    pub promo_amount: U128,
    /// Deposits needed before the bonus can be claimed.
    pub promo_min_deposit: U128,
    /// Wagers needed to unlock withdrawals, as a multiple of the bonus (20 = 20x).
    pub promo_wager_multiple: u32,
    /// A position must stay open this long for its wager to count toward the turnover.
    pub promo_min_hold_sec: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct PricePoint {
    pub price: U128,
    pub updated_at: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Default)]
pub struct Account {
    /// Free USDC balance.
    pub balance: U128,
    pub nitro: U128,
    pub vault_shares: U128,
    pub position_ids: Vec<u64>,
    /// Lifetime totals, all in USDC base units.
    pub total_deposited: U128,
    pub total_withdrawn: U128,
    pub volume: U128,
    pub profit: U128,
    pub loss: U128,
    pub trades: u32,
    /// USDC locked in withdrawal requests waiting for review.
    pub pending_withdraw: U128,
    /// The new-user bonus was claimed (once per account).
    pub promo_claimed: bool,
    /// Bonus balance, usable for trading only (not withdrawable) until the turnover is reached.
    /// Part of it is display-only credit; `promo_backed` is the part that is real USDC won with it.
    pub promo_bonus: U128,
    pub promo_backed: U128,
    /// Wagers still needed before withdrawals unlock, and wagers counted so far.
    pub promo_wager_required: U128,
    pub promo_wagered: U128,
    /// X (Twitter) username given when claiming the bonus, for the follow check.
    pub x_handle: Option<String>,
}

/// Public trading stats for the leaderboard.
#[near(serializers = [json])]
pub struct UserStats {
    pub account: AccountId,
    pub volume: U128,
    pub profit: U128,
    pub loss: U128,
    pub trades: u32,
    pub nitro: U128,
}

/// NITRO points → $NITRO token conversion, set by the owner at token launch.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct NitroConversion {
    /// The $NITRO token contract (NEP-141). Conversion stays closed until it is set.
    pub token: Option<AccountId>,
    /// Token base units paid per 1 NITRO point (points have 6 decimals).
    pub tokens_per_point: U128,
    pub open: bool,
}

#[near(serializers = [json])]
pub struct NitroView {
    /// NITRO points minted from real USDC losses, all time.
    pub total_minted: U128,
    pub total_converted: U128,
    pub conversion: NitroConversion,
}

#[near(serializers = [json])]
pub struct PromoView {
    pub amount: U128,
    pub min_deposit: U128,
    pub wager_multiple: u32,
    pub min_hold_sec: u64,
    /// USDC set aside for bonuses that have not been claimed yet.
    pub budget: U128,
    pub claims: u32,
    pub active: bool,
}

/// A withdrawal waiting for the owner's review.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct WithdrawRequest {
    pub id: u64,
    pub account: AccountId,
    pub amount: U128,
    /// Milliseconds since the Unix epoch.
    pub requested_at: u64,
}

/// One line in a user's history: deposits, withdrawals, opens and closes.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LedgerEntry {
    /// deposit | withdraw_request | withdraw | withdraw_rejected | withdraw_cancelled | refund
    /// | vault_deposit | vault_withdraw | open | close
    pub kind: String,
    /// USDC moved: the deposit, the withdrawal, the wager on open, or the payout on close.
    pub amount: U128,
    /// Milliseconds since the Unix epoch.
    pub at: u64,
    pub position_id: Option<u64>,
    pub market: Option<String>,
    pub long: Option<bool>,
    pub leverage: Option<u32>,
    /// Entry price on open, exit price on close.
    pub price: Option<U128>,
    /// Profit or loss on close, as a signed integer string.
    pub pnl: Option<String>,
    pub fee: Option<U128>,
    pub nitro: Option<U128>,
    /// close | max_loss | take_profit
    pub reason: Option<String>,
}

impl LedgerEntry {
    fn new(kind: &str, amount: u128) -> Self {
        Self {
            kind: kind.into(),
            amount: U128(amount),
            at: env::block_timestamp_ms(),
            position_id: None,
            market: None,
            long: None,
            leverage: None,
            price: None,
            pnl: None,
            fee: None,
            nitro: None,
            reason: None,
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Position {
    pub id: u64,
    pub owner: AccountId,
    pub market: String,
    pub long: bool,
    pub wager: U128,
    pub leverage: u32,
    pub entry: U128,
    /// Max loss price: the position loses 100% of the wager here.
    pub liq: U128,
    pub tp: Option<U128>,
    /// Vault funds reserved for this position's maximum payout.
    pub reserved: U128,
    pub opened_at: u64,
    /// Bonus-funded part of the wager: virtual (display-only) USDC and real USDC won with the bonus.
    pub bonus_virtual: U128,
    pub bonus_backed: U128,
}

#[near(serializers = [json])]
pub struct VaultView {
    pub liquidity: U128,
    pub reserved: U128,
    pub free: U128,
    pub total_shares: U128,
    pub fees: U128,
    pub open_interest: U128,
}

#[near(serializers = [json])]
pub struct CloseResult {
    pub id: u64,
    pub pnl: String,
    pub fee: U128,
    pub exit: U128,
    pub reason: String,
}

/// A native NEAR transfer to the pool account found on chain, credited at the NEAR price of its time.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct NearCredit {
    pub key: String,
    pub account: AccountId,
    /// Amount in yoctoNEAR.
    pub yocto: U128,
    /// NEAR/USD price (8 decimals) at the time of the transfer.
    pub price: U128,
}

#[near(serializers = [json])]
pub struct NearView {
    /// NEAR received from deposits and not yet taken out by the owner to swap.
    pub held: U128,
    /// USDC owed to users for NEAR deposits that is not yet backed by USDC in the contract.
    pub unbacked_usdc: U128,
}

/// A plain transfer to the pool address that the indexer found on chain.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TransferCredit {
    /// Unique id of the transfer, e.g. "<tx hash>:<receipt id>:<event index>".
    pub key: String,
    pub account: AccountId,
    pub amount: U128,
}

#[near(serializers = [json])]
pub struct PoolView {
    /// Send USDC here. This is the contract account.
    pub deposit_address: AccountId,
    pub usdc: AccountId,
    /// USDC the contract owes to traders, liquidity providers and fees.
    pub accounted: U128,
    pub in_flight: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    usdc: AccountId,
    oracle: AccountId,
    paused: bool,
    config: Config,
    accounts: LookupMap<AccountId, Account>,
    positions: LookupMap<u64, Position>,
    prices: LookupMap<String, PricePoint>,
    next_id: u64,
    liquidity: u128,
    reserved: u128,
    total_shares: u128,
    fees: u128,
    open_interest: u128,
    /// USDC that belongs to someone: trader balances, open wagers, vault liquidity and fees.
    accounted: u128,
    /// USDC sent out whose transfer has not been confirmed yet.
    in_flight: u128,
    /// NEAR deposits: yoctoNEAR held for them, and the USDC credited for them not yet backed by USDC.
    near_held: u128,
    near_backed: u128,
    /// Bumped on every outgoing transfer and confirmation, so a balance check that raced one is retried.
    out_seq: u64,
    /// When the running credit check started (0 = none). A stuck check expires after 5 minutes.
    credit_pending: u64,
    credited: LookupSet<String>,
    ledger: LookupMap<AccountId, Vec<LedgerEntry>>,
    withdraw_requests: IterableMap<u64, WithdrawRequest>,
    next_withdraw_id: u64,
    /// Cap on bonuses still to be paid, in USDC. Bonuses come out of the vault; no USDC is sent in for them.
    promo_budget: u128,
    promo_claims: u32,
    /// Every account that has used the contract, in order of first use.
    users: Vector<AccountId>,
    nitro_minted: u128,
    nitro_converted: u128,
    nitro_conversion: NitroConversion,
}

fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    // Values stay far below u128::MAX for USDC amounts and 8-decimal prices; overflow-checks are on.
    a.checked_mul(b).expect("overflow") / c
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, usdc: AccountId, oracle: AccountId) -> Self {
        Self {
            owner,
            usdc,
            oracle,
            paused: false,
            config: Config {
                max_leverage: 1000,
                min_wager: U128(1_000_000),
                max_position_bps: 200,
                max_profit_multiple: 10,
                profit_fee_bps: 1000,
                max_price_age_sec: 30,
                max_open_positions: 10,
                nitro_per_usdc: 10,
                markets: vec!["NEAR".into(), "BTC".into(), "ETH".into(), "SOL".into()],
                spread_bps: 0,
                min_deposit: U128(1_000_000),
                max_deposit: U128(1_000_000_000),
                slippage_base_ppm: 50,
                slippage_impact_ppm: 200,
                promo_amount: U128(3_000_000),
                promo_min_deposit: U128(2_000_000),
                promo_wager_multiple: 20,
                promo_min_hold_sec: 60,
            },
            accounts: LookupMap::new(b"a"),
            positions: LookupMap::new(b"p"),
            prices: LookupMap::new(b"x"),
            next_id: 1,
            liquidity: 0,
            reserved: 0,
            total_shares: 0,
            fees: 0,
            open_interest: 0,
            accounted: 0,
            near_held: 0,
            near_backed: 0,
            in_flight: 0,
            out_seq: 0,
            credit_pending: 0,
            credited: LookupSet::new(b"c"),
            ledger: LookupMap::new(b"l"),
            withdraw_requests: IterableMap::new(b"w"),
            next_withdraw_id: 1,
            promo_budget: 300_000_000, // 100 bonuses of 3 USDC
            promo_claims: 0,
            users: Vector::new(b"u"),
            nitro_minted: 0,
            nitro_converted: 0,
            nitro_conversion: NitroConversion { token: None, tokens_per_point: U128(0), open: false },
        }
    }

    // ---------- Deposits (NEP-141 receiver) ----------

    /// Called by the USDC contract. msg "" credits the trading balance, msg "vault" buys vault shares.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdc, "Only USDC is accepted");
        let amount = amount.0;
        require!(amount > 0, "Nothing deposited");
        let mut acct = self.account_or_default(&sender_id);
        // USDC that becomes owed to someone (all of it, except USDC that backs NEAR deposits).
        let mut counted = amount;
        match msg.as_str() {
            "" | "trade" => {
                require!(amount >= self.config.min_deposit.0, "Deposit below the minimum");
                require!(self.config.max_deposit.0 == 0 || amount <= self.config.max_deposit.0, "Deposit above the maximum");
                acct.balance = U128(acct.balance.0 + amount);
                acct.total_deposited = U128(acct.total_deposited.0 + amount);
                self.log(&sender_id, LedgerEntry::new("deposit", amount));
                env::log_str(&format!("EVENT_JSON:{{\"event\":\"deposit\",\"account\":\"{}\",\"amount\":\"{}\"}}", sender_id, amount));
            }
            "vault" => {
                let shares = if self.total_shares == 0 || self.liquidity == 0 {
                    amount
                } else {
                    mul_div(amount, self.total_shares, self.liquidity)
                };
                require!(shares > 0, "Deposit too small");
                self.liquidity += amount;
                self.total_shares += shares;
                acct.vault_shares = U128(acct.vault_shares.0 + shares);
                self.log(&sender_id, LedgerEntry::new("vault_deposit", amount));
                env::log_str(&format!("EVENT_JSON:{{\"event\":\"vault_deposit\",\"account\":\"{}\",\"amount\":\"{}\",\"shares\":\"{}\"}}", sender_id, amount, shares));
            }
            "settle_near" => {
                // USDC bought with deposited NEAR: it backs balances that are already credited.
                let backs = amount.min(self.near_backed);
                self.near_backed -= backs;
                // Anything beyond what NEAR deposits need goes to the vault.
                let extra = amount - backs;
                self.liquidity += extra;
                counted = extra;
                self.log(&sender_id, LedgerEntry::new("settle_near", amount));
            }
            _ => env::panic_str("Unknown msg: use \"\" to trade or \"vault\" to provide liquidity"),
        }
        self.accounts.insert(sender_id, acct);
        self.accounted += counted;
        PromiseOrValue::Value(U128(0))
    }

    /// Withdraw free trading balance.
    /// Claim the new-user bonus: requires `promo_min_deposit` of deposits and the user's X username
    /// (they must follow the project on X; the owner checks that when reviewing withdrawals).
    /// Once per account; not for the owner or the contract account. The bonus is paid from the vault,
    /// up to the promo cap. The whole balance stays locked for withdrawals until the turnover is reached.
    pub fn claim_promo(&mut self, x_handle: String) -> U128 {
        let who = env::predecessor_account_id();
        require!(who != self.owner && who != env::current_account_id(), "The team wallet cannot claim the bonus");
        let handle = x_handle.trim().trim_start_matches('@').to_string();
        require!(
            !handle.is_empty() && handle.len() <= 15 && handle.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'),
            "Enter your X username"
        );
        let mut acct = self.account(&who);
        let amount = self.config.promo_amount.0;
        require!(amount > 0, "There is no promo right now");
        require!(!acct.promo_claimed, "You already claimed the bonus");
        require!(acct.total_deposited.0 >= self.config.promo_min_deposit.0, "Deposit the minimum first to claim the bonus");
        require!(self.promo_budget >= amount, "The promo is fully claimed");
        self.promo_budget -= amount;
        self.promo_claims += 1;
        // Display-only credit: no USDC moves now. The vault pays it only when the turnover is reached.
        acct.x_handle = Some(handle.clone());
        acct.promo_claimed = true;
        acct.promo_bonus = U128(amount);
        acct.promo_backed = U128(0);
        acct.promo_wager_required = U128(amount * self.config.promo_wager_multiple as u128);
        acct.promo_wagered = U128(0);
        self.accounts.insert(who.clone(), acct);
        let mut e = LedgerEntry::new("promo_bonus", amount);
        e.reason = Some(format!("@{}", handle));
        self.log(&who, e);
        U128(amount)
    }

    pub fn get_user_count(&self) -> u32 {
        self.users.len()
    }

    /// Trading stats of every user, in pages, for the leaderboard.
    pub fn get_users_stats(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<UserStats> {
        let from = from_index.unwrap_or(0);
        let end = (from + limit.unwrap_or(100).min(200)).min(self.users.len());
        (from..end)
            .filter_map(|i| self.users.get(i))
            .map(|id| {
                let a = self.get_account(id.clone());
                UserStats { account: id.clone(), volume: a.volume, profit: a.profit, loss: a.loss, trades: a.trades, nitro: a.nitro }
            })
            .collect()
    }

    pub fn get_nitro(&self) -> NitroView {
        NitroView {
            total_minted: U128(self.nitro_minted),
            total_converted: U128(self.nitro_converted),
            conversion: self.nitro_conversion.clone(),
        }
    }

    /// Owner: configure the $NITRO token conversion (at token launch). The contract must hold enough
    /// $NITRO tokens to pay conversions; the owner sends them to this account.
    pub fn set_nitro_conversion(&mut self, token: Option<AccountId>, tokens_per_point: U128, open: bool) {
        self.assert_owner();
        require!(!open || (token.is_some() && tokens_per_point.0 > 0), "Set the token and rate before opening");
        self.nitro_conversion = NitroConversion { token, tokens_per_point, open };
    }

    /// Convert NITRO points into $NITRO tokens. Attach 0.00125 NEAR so the token can register you;
    /// if the transfer fails the points come back.
    #[payable]
    pub fn convert_nitro(&mut self, points: U128) -> Promise {
        let conv = self.nitro_conversion.clone();
        require!(conv.open, "Conversion opens at the $NITRO token launch");
        let token = conv.token.expect("No token set");
        let who = env::predecessor_account_id();
        let mut acct = self.account(&who);
        require!(points.0 > 0 && points.0 <= acct.nitro.0, "Not enough NITRO points");
        let amount = points.0.checked_mul(conv.tokens_per_point.0).expect("overflow") / 1_000_000;
        require!(amount > 0, "Amount too small");
        acct.nitro = U128(acct.nitro.0 - points.0);
        self.accounts.insert(who.clone(), acct);
        self.nitro_converted += points.0;
        let mut e = LedgerEntry::new("nitro_convert", 0);
        e.nitro = Some(points);
        e.reason = Some(amount.to_string());
        self.log(&who, e);
        let register = format!("{{\"account_id\":\"{}\",\"registration_only\":true}}", who);
        let transfer = format!("{{\"receiver_id\":\"{}\",\"amount\":\"{}\",\"memo\":\"NITRO conversion\"}}", who, amount);
        Promise::new(token.clone())
            .function_call("storage_deposit".to_string(), register.into_bytes(), env::attached_deposit(), Gas::from_tgas(10))
            .then(Promise::new(token).function_call("ft_transfer".to_string(), transfer.into_bytes(), NearToken::from_yoctonear(1), Gas::from_tgas(15)))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).on_convert(who, points))
    }

    #[private]
    pub fn on_convert(&mut self, account: AccountId, points: U128, #[callback_result] result: Result<(), PromiseError>) {
        if result.is_err() {
            let mut acct = self.account_or_default(&account);
            acct.nitro = U128(acct.nitro.0 + points.0);
            self.accounts.insert(account.clone(), acct);
            self.nitro_converted -= points.0;
            let mut e = LedgerEntry::new("nitro_refund", 0);
            e.nitro = Some(points);
            self.log(&account, e);
        }
    }

    pub fn get_promo(&self) -> PromoView {
        PromoView {
            amount: self.config.promo_amount,
            min_deposit: self.config.promo_min_deposit,
            wager_multiple: self.config.promo_wager_multiple,
            min_hold_sec: self.config.promo_min_hold_sec,
            budget: U128(self.promo_budget),
            claims: self.promo_claims,
            active: self.config.promo_amount.0 > 0 && self.promo_budget >= self.config.promo_amount.0,
        }
    }

    /// Owner: set how much more (in USDC) may be paid out as bonuses. Nothing is transferred.
    pub fn set_promo_budget(&mut self, budget: U128) {
        self.assert_owner();
        self.promo_budget = budget.0;
    }

    /// Ask to withdraw free balance. The amount is locked until the owner approves (USDC is sent)
    /// or rejects it (the amount returns to the balance). The user can cancel while it waits.
    pub fn request_withdraw(&mut self, amount: U128) -> u64 {
        let who = env::predecessor_account_id();
        let mut acct = self.account(&who);
        require!(amount.0 > 0 && amount.0 <= acct.balance.0, "Not enough free balance");
        let open = self.withdraw_requests.values().filter(|r| r.account == who).count();
        require!(open < 5, "You already have 5 withdrawals waiting for review");
        acct.balance = U128(acct.balance.0 - amount.0);
        acct.pending_withdraw = U128(acct.pending_withdraw.0 + amount.0);
        self.accounts.insert(who.clone(), acct);
        let id = self.next_withdraw_id;
        self.next_withdraw_id += 1;
        self.withdraw_requests.insert(id, WithdrawRequest { id, account: who.clone(), amount, requested_at: env::block_timestamp_ms() });
        let mut e = LedgerEntry::new("withdraw_request", amount.0);
        e.position_id = Some(id);
        self.log(&who, e);
        env::log_str(&format!("EVENT_JSON:{{\"event\":\"withdraw_request\",\"id\":{},\"account\":\"{}\",\"amount\":\"{}\"}}", id, who, amount.0));
        id
    }

    /// Cancel your own withdrawal request; the amount returns to your balance.
    pub fn cancel_withdraw(&mut self, id: u64) {
        let req = self.withdraw_requests.get(&id).cloned().expect("Request not found");
        require!(env::predecessor_account_id() == req.account, "Not your request");
        self.unlock_request(req, "withdraw_cancelled", None);
    }

    /// Owner: approve a request and send the USDC to the user.
    pub fn approve_withdraw(&mut self, id: u64) -> Promise {
        self.assert_owner();
        let req = self.withdraw_requests.remove(&id).expect("Request not found");
        let mut acct = self.account_or_default(&req.account);
        acct.pending_withdraw = U128(acct.pending_withdraw.0 - req.amount.0);
        acct.total_withdrawn = U128(acct.total_withdrawn.0 + req.amount.0);
        self.accounts.insert(req.account.clone(), acct);
        let mut e = LedgerEntry::new("withdraw", req.amount.0);
        e.position_id = Some(id);
        self.log(&req.account, e);
        self.send_usdc(req.account, req.amount.0)
    }

    /// Owner: reject a request; the amount returns to the user's balance.
    pub fn reject_withdraw(&mut self, id: u64, reason: Option<String>) {
        self.assert_owner();
        let req = self.withdraw_requests.get(&id).cloned().expect("Request not found");
        self.unlock_request(req, "withdraw_rejected", reason.map(|r| r.chars().take(140).collect()));
    }

    /// Withdrawal requests waiting for review, oldest first.
    pub fn get_withdraw_requests(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<WithdrawRequest> {
        let mut list: Vec<WithdrawRequest> = self.withdraw_requests.values().cloned().collect();
        list.sort_by_key(|r| r.id);
        list.into_iter().skip(from_index.unwrap_or(0) as usize).take(limit.unwrap_or(100).min(200) as usize).collect()
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    /// Burn vault shares for USDC. Only liquidity not reserved by open positions can leave.
    pub fn vault_withdraw(&mut self, shares: U128) -> Promise {
        let who = env::predecessor_account_id();
        let mut acct = self.account(&who);
        require!(shares.0 > 0 && shares.0 <= acct.vault_shares.0, "Not enough vault shares");
        let amount = mul_div(shares.0, self.liquidity, self.total_shares);
        require!(amount <= self.liquidity - self.reserved, "That liquidity is reserved for open positions, try a smaller amount");
        acct.vault_shares = U128(acct.vault_shares.0 - shares.0);
        self.total_shares -= shares.0;
        self.liquidity -= amount;
        self.accounts.insert(who.clone(), acct);
        self.log(&who, LedgerEntry::new("vault_withdraw", amount));
        self.send_usdc(who, amount)
    }

    #[private]
    pub fn on_withdraw(&mut self, account: AccountId, amount: U128, #[callback_result] result: Result<(), PromiseError>) {
        self.in_flight -= amount.0;
        self.out_seq += 1;
        if result.is_err() {
            self.accounted += amount.0;
            // Transfer failed (for example the account is not registered on USDC): credit it back.
            let mut acct = self.account_or_default(&account);
            acct.balance = U128(acct.balance.0 + amount.0);
            acct.total_withdrawn = U128(acct.total_withdrawn.0.saturating_sub(amount.0));
            self.accounts.insert(account.clone(), acct);
            self.log(&account, LedgerEntry::new("refund", amount.0));
        }
    }

    // ---------- Plain transfers to the pool address ----------

    /// Credit plain USDC transfers that the indexer found. Only the oracle account can call this.
    /// The contract first reads its own USDC balance, and in the callback credits only what is not
    /// already owed to someone.
    pub fn credit_transfers(&mut self, credits: Vec<TransferCredit>) -> Promise {
        require!(env::predecessor_account_id() == self.oracle, "Only the oracle can credit transfers");
        require!(!credits.is_empty() && credits.len() <= 50, "Send 1 to 50 credits");
        let now = env::block_timestamp();
        require!(self.credit_pending == 0 || now - self.credit_pending > 300 * NANOS, "A credit check is already running");
        self.credit_pending = now;
        let args = format!("{{\"account_id\":\"{}\"}}", env::current_account_id());
        Promise::new(self.usdc.clone())
            .function_call("ft_balance_of".to_string(), args.into_bytes(), NearToken::from_yoctonear(0), Gas::from_tgas(5))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(60)).on_credit_balance(credits, self.out_seq))
    }

    #[private]
    pub fn on_credit_balance(&mut self, credits: Vec<TransferCredit>, out_seq: u64, #[callback_result] balance: Result<U128, PromiseError>) -> Vec<String> {
        self.credit_pending = 0;
        let Ok(balance) = balance else {
            env::log_str("credit check failed: could not read the USDC balance");
            return vec![];
        };
        if out_seq != self.out_seq {
            env::log_str("credit check raced a withdrawal, try again");
            return vec![];
        }
        let mut done = vec![];
        for c in credits {
            if self.credited.contains(&c.key) || c.amount.0 == 0 {
                continue;
            }
            // NEAR-backed balances are not in the USDC balance yet, so leave them out of the bound.
            if self.accounted - self.near_backed + self.in_flight + c.amount.0 > balance.0 {
                env::log_str(&format!("credit skipped, not enough unassigned USDC: {}", c.key));
                continue;
            }
            let mut acct = self.account_or_default(&c.account);
            acct.balance = U128(acct.balance.0 + c.amount.0);
            acct.total_deposited = U128(acct.total_deposited.0 + c.amount.0);
            self.accounts.insert(c.account.clone(), acct);
            self.log(&c.account, LedgerEntry::new("deposit", c.amount.0));
            self.accounted += c.amount.0;
            env::log_str(&format!(
                "EVENT_JSON:{{\"event\":\"deposit\",\"account\":\"{}\",\"amount\":\"{}\",\"key\":\"{}\"}}",
                c.account, c.amount.0, c.key
            ));
            self.credited.insert(c.key.clone());
            done.push(c.key);
        }
        done
    }

    pub fn is_credited(&self, key: String) -> bool {
        self.credited.contains(&key)
    }

    // ---------- NEAR deposits ----------

    /// Deposit NEAR: credited to your trading balance in USDC at the current NEAR price.
    #[payable]
    pub fn deposit_near(&mut self) -> U128 {
        let who = env::predecessor_account_id();
        let yocto = env::attached_deposit().as_yoctonear();
        let price = self.fresh_price("NEAR");
        let usd = self.credit_near(&who, yocto, price, None);
        U128(usd)
    }

    /// Oracle: credit native NEAR transfers made to the pool account (for example before launch),
    /// at the NEAR price of their time. Each is credited once, and only up to the NEAR the contract
    /// can account for.
    pub fn credit_near_transfers(&mut self, credits: Vec<NearCredit>) -> Vec<String> {
        require!(env::predecessor_account_id() == self.oracle, "Only the oracle can credit transfers");
        require!(credits.len() <= 50, "Send up to 50 credits");
        let mut done = vec![];
        for c in credits {
            if self.credited.contains(&c.key) || c.yocto.0 == 0 || c.price.0 == 0 {
                continue;
            }
            if c.account == self.owner || c.account == env::current_account_id() {
                continue;
            }
            if self.near_held + c.yocto.0 > self.free_near() {
                env::log_str(&format!("NEAR credit skipped, not enough unassigned NEAR: {}", c.key));
                continue;
            }
            self.credited.insert(c.key.clone());
            self.credit_near(&c.account, c.yocto.0, c.price.0, Some(c.key.clone()));
            done.push(c.key);
        }
        done
    }

    /// Owner: take deposited NEAR out to swap it for USDC. Send the USDC back with msg "settle_near".
    pub fn withdraw_near(&mut self, yocto: U128) -> Promise {
        self.assert_owner();
        require!(yocto.0 > 0 && yocto.0 <= self.near_held, "Not that much deposited NEAR");
        self.near_held -= yocto.0;
        Promise::new(self.owner.clone()).transfer(NearToken::from_yoctonear(yocto.0))
    }

    pub fn get_near(&self) -> NearView {
        NearView { held: U128(self.near_held), unbacked_usdc: U128(self.near_backed) }
    }

    // ---------- Oracle ----------

    /// The oracle pushes prices with 8 decimals, e.g. NEAR at $3.10 is 310000000.
    pub fn push_prices(&mut self, prices: Vec<(String, U128)>) {
        require!(env::predecessor_account_id() == self.oracle, "Only the oracle can push prices");
        let now = env::block_timestamp();
        for (market, price) in prices {
            require!(self.config.markets.contains(&market), "Unknown market");
            require!(price.0 > 0, "Bad price");
            self.prices.insert(market, PricePoint { price, updated_at: now });
        }
    }

    // ---------- Trading ----------

    /// Open a position. `tp_roe_bps` is the take profit as a return on the wager (10000 = +100%).
    /// `acceptable_price` is the trader's slippage limit: the worst entry they accept
    /// (highest for a long, lowest for a short).
    pub fn open_position(
        &mut self,
        market: String,
        long: bool,
        wager: U128,
        leverage: u32,
        tp_roe_bps: Option<u32>,
        acceptable_price: Option<U128>,
    ) -> u64 {
        require!(!self.paused, "New positions are paused");
        require!(self.config.markets.contains(&market), "Unknown market");
        require!(leverage >= 1 && leverage <= self.config.max_leverage, "Leverage out of range");
        let who = env::predecessor_account_id();
        let mut acct = self.account(&who);
        let wager = wager.0;
        require!(wager >= self.config.min_wager.0, "Wager below minimum");
        // A bonus pays for the wager when it covers it; otherwise the real balance does.
        let from_bonus = acct.promo_wager_required.0 > 0 && acct.promo_bonus.0 >= wager;
        require!(from_bonus || wager <= acct.balance.0, "Not enough free balance");
        require!((acct.position_ids.len() as u32) < self.config.max_open_positions, "Too many open positions");

        let size = wager * leverage as u128;
        require!(size <= mul_div(self.liquidity, self.config.max_position_bps as u128, BPS), "Position too large for the vault");
        let entry = self.with_slippage(self.with_spread(self.fresh_price(&market), long), long, size);
        if let Some(limit) = acceptable_price {
            require!(if long { entry <= limit.0 } else { entry >= limit.0 }, "Price moved beyond your slippage limit");
        }

        // Reserve the most this position can be paid.
        let max_profit = wager * self.config.max_profit_multiple as u128;
        let tp = tp_roe_bps.map(|roe| {
            require!(roe > 0, "Take profit must be positive");
            let lev_bps = leverage as u128 * BPS;
            U128(if long { mul_div(entry, lev_bps + roe as u128, lev_bps) } else { mul_div(entry, lev_bps - (roe as u128).min(lev_bps - 1), lev_bps) })
        });
        let reserve = match tp_roe_bps {
            Some(roe) => max_profit.min(mul_div(wager, roe as u128, BPS)),
            None => max_profit,
        };
        require!(reserve <= self.liquidity - self.reserved, "The vault cannot cover this position right now");

        let liq = if long { mul_div(entry, leverage as u128 - 1, leverage as u128) } else { mul_div(entry, leverage as u128 + 1, leverage as u128) };
        let id = self.next_id;
        self.next_id += 1;
        let pos = Position {
            id,
            owner: who.clone(),
            market,
            long,
            wager: U128(wager),
            leverage,
            entry: U128(entry),
            liq: U128(liq),
            tp,
            reserved: U128(reserve),
            opened_at: env::block_timestamp(),
            bonus_virtual: U128(0),
            bonus_backed: U128(0),
        };
        let mut pos = pos;
        if from_bonus {
            // Real winnings in the bonus are used last, display-only credit first.
            let virtual_part = (acct.promo_bonus.0 - acct.promo_backed.0).min(wager);
            let backed_part = wager - virtual_part;
            acct.promo_bonus = U128(acct.promo_bonus.0 - wager);
            acct.promo_backed = U128(acct.promo_backed.0 - backed_part);
            pos.bonus_virtual = U128(virtual_part);
            pos.bonus_backed = U128(backed_part);
        } else {
            acct.balance = U128(acct.balance.0 - wager);
        }
        acct.position_ids.push(id);
        acct.volume = U128(acct.volume.0 + size);
        let mut e = LedgerEntry::new("open", wager);
        e.position_id = Some(id);
        e.market = Some(pos.market.clone());
        e.long = Some(long);
        e.leverage = Some(leverage);
        e.price = Some(U128(entry));
        self.log(&who, e);
        self.reserved += reserve;
        self.open_interest += size;
        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"open\",\"id\":{},\"account\":\"{}\",\"market\":\"{}\",\"long\":{},\"wager\":\"{}\",\"leverage\":{},\"entry\":\"{}\"}}",
            id, who, pos.market, long, wager, leverage, entry
        ));
        self.positions.insert(id, pos);
        self.accounts.insert(who, acct);
        id
    }

    /// Close your own position at the current oracle price (minus the spread).
    /// `acceptable_price` is the worst exit you accept (lowest for a long, highest for a short).
    pub fn close_position(&mut self, id: u64, acceptable_price: Option<U128>) -> CloseResult {
        let pos = self.positions.get(&id).expect("Position not found").clone();
        require!(env::predecessor_account_id() == pos.owner, "Not your position");
        let mark = self.fresh_price(&pos.market);
        // If the price already crossed max loss or take profit, settle at that level.
        let (exit, reason) = if Self::crossed_liq(&pos, mark) {
            (pos.liq.0, "max_loss")
        } else if Self::crossed_tp(&pos, mark) {
            (pos.tp.unwrap().0, "take_profit")
        } else {
            let exit = self.with_slippage(self.with_spread(mark, !pos.long), !pos.long, pos.wager.0 * pos.leverage as u128);
            if let Some(limit) = acceptable_price {
                require!(if pos.long { exit >= limit.0 } else { exit <= limit.0 }, "Price moved beyond your slippage limit");
            }
            (exit, "close")
        };
        self.settle(pos, exit, reason)
    }

    /// Anyone (usually the keeper) can trigger max loss and take profit closes for these positions.
    pub fn run_keeper(&mut self, ids: Vec<u64>) -> Vec<CloseResult> {
        let mut out = vec![];
        for id in ids {
            let Some(pos) = self.positions.get(&id).cloned() else { continue };
            let Some(mark) = self.price_if_fresh(&pos.market) else { continue };
            if Self::crossed_liq(&pos, mark) {
                let liq = pos.liq.0;
                out.push(self.settle(pos, liq, "max_loss"));
            } else if Self::crossed_tp(&pos, mark) {
                let tp = pos.tp.unwrap().0;
                out.push(self.settle(pos, tp, "take_profit"));
            }
        }
        out
    }

    // ---------- Views ----------

    pub fn get_account(&self, account_id: AccountId) -> Account {
        self.accounts.get(&account_id).cloned().unwrap_or_default()
    }

    pub fn get_positions(&self, account_id: AccountId) -> Vec<Position> {
        let acct = self.get_account(account_id);
        acct.position_ids.iter().filter_map(|id| self.positions.get(id).cloned()).collect()
    }

    pub fn get_position(&self, id: u64) -> Option<Position> {
        self.positions.get(&id).cloned()
    }

    pub fn get_vault(&self) -> VaultView {
        VaultView {
            liquidity: U128(self.liquidity),
            reserved: U128(self.reserved),
            free: U128(self.liquidity - self.reserved),
            total_shares: U128(self.total_shares),
            fees: U128(self.fees),
            open_interest: U128(self.open_interest),
        }
    }

    /// Open positions with id >= `from_id`, scanning at most `limit` ids. Used by the keeper.
    pub fn get_open_positions(&self, from_id: u64, limit: u64) -> Vec<Position> {
        let end = self.next_id.min(from_id.saturating_add(limit.min(500)));
        (from_id.max(1)..end).filter_map(|id| self.positions.get(&id).cloned()).collect()
    }

    /// A user's history, newest first.
    pub fn get_ledger(&self, account_id: AccountId, from_index: Option<u32>, limit: Option<u32>) -> Vec<LedgerEntry> {
        let list = self.ledger.get(&account_id).cloned().unwrap_or_default();
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(50).min(100) as usize;
        list.iter().rev().skip(from).take(limit).cloned().collect()
    }

    pub fn get_pool(&self) -> PoolView {
        PoolView {
            deposit_address: env::current_account_id(),
            usdc: self.usdc.clone(),
            accounted: U128(self.accounted),
            in_flight: U128(self.in_flight),
        }
    }

    pub fn get_oracle(&self) -> AccountId {
        self.oracle.clone()
    }

    pub fn get_price(&self, market: String) -> Option<PricePoint> {
        self.prices.get(&market).cloned()
    }

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_next_id(&self) -> u64 {
        self.next_id
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    // ---------- Owner ----------

    pub fn set_config(&mut self, config: Config) {
        self.assert_owner();
        require!(config.max_leverage >= 1 && config.max_profit_multiple >= 1, "Bad config");
        require!(config.profit_fee_bps <= 5000 && config.max_position_bps <= 2000, "Limits too high");
        require!(config.spread_bps <= 100, "Spread too high");
        require!(config.slippage_base_ppm <= 10_000 && config.slippage_impact_ppm <= 10_000, "Slippage too high");
        self.config = config;
    }

    /// Hand the admin role to another account.
    pub fn set_owner(&mut self, owner: AccountId) {
        self.assert_owner();
        self.owner = owner;
    }

    pub fn set_oracle(&mut self, oracle: AccountId) {
        self.assert_owner();
        self.oracle = oracle;
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    /// Collect protocol fees. Trader balances and vault liquidity are not reachable from here.
    pub fn withdraw_fees(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        require!(amount.0 <= self.fees, "Not enough fees");
        self.fees -= amount.0;
        let owner = self.owner.clone();
        // On failure the amount returns to the owner's trading balance via on_withdraw.
        self.send_usdc(owner, amount.0)
    }
}

impl Contract {
    /// NEAR the contract holds beyond what its storage needs, minus a small reserve for gas.
    fn free_near(&self) -> u128 {
        let storage = env::storage_usage() as u128 * env::storage_byte_cost().as_yoctonear();
        let reserve = 2 * 10u128.pow(24);
        env::account_balance().as_yoctonear().saturating_sub(storage + reserve)
    }

    /// Credit `yocto` NEAR at `price` (8 decimals) as USDC to `who`.
    fn credit_near(&mut self, who: &AccountId, yocto: u128, price: u128, key: Option<String>) -> u128 {
        // yocto (24 dp) * price (8 dp) -> USDC base units (6 dp)
        let usd = yocto.checked_mul(price).expect("overflow") / 10u128.pow(26);
        require!(usd >= self.config.min_deposit.0, "Deposit below the minimum");
        require!(self.config.max_deposit.0 == 0 || usd <= self.config.max_deposit.0, "Deposit above the maximum");
        let mut acct = self.account_or_default(who);
        acct.balance = U128(acct.balance.0 + usd);
        acct.total_deposited = U128(acct.total_deposited.0 + usd);
        self.accounts.insert(who.clone(), acct);
        self.accounted += usd;
        self.near_backed += usd;
        self.near_held += yocto;
        let mut e = LedgerEntry::new("deposit_near", usd);
        e.price = Some(U128(price));
        e.nitro = Some(U128(yocto)); // NEAR amount in yocto
        e.reason = key;
        self.log(who, e);
        usd
    }

    fn unlock_request(&mut self, req: WithdrawRequest, kind: &str, reason: Option<String>) {
        self.withdraw_requests.remove(&req.id);
        let mut acct = self.account_or_default(&req.account);
        acct.pending_withdraw = U128(acct.pending_withdraw.0 - req.amount.0);
        acct.balance = U128(acct.balance.0 + req.amount.0);
        self.accounts.insert(req.account.clone(), acct);
        let mut e = LedgerEntry::new(kind, req.amount.0);
        e.position_id = Some(req.id);
        e.reason = reason;
        self.log(&req.account, e);
    }

    fn log(&mut self, who: &AccountId, e: LedgerEntry) {
        let first = !self.ledger.contains_key(who);
        if first {
            self.users.push(who.clone());
        }
        let mut list = self.ledger.get(who).cloned().unwrap_or_default();
        list.push(e);
        if list.len() > LEDGER_MAX {
            let extra = list.len() - LEDGER_MAX;
            list.drain(..extra);
        }
        self.ledger.insert(who.clone(), list);
    }

    /// Price after slippage: a base amount plus price impact proportional to the position size.
    fn slippage_ppm(&self, size: u128) -> u128 {
        let max_size = mul_div(self.liquidity.max(1), self.config.max_position_bps as u128, BPS).max(1);
        self.config.slippage_base_ppm as u128 + mul_div(self.config.slippage_impact_ppm as u128, size.min(max_size), max_size)
    }

    fn with_slippage(&self, price: u128, buy: bool, size: u128) -> u128 {
        let ppm = self.slippage_ppm(size);
        if buy { mul_div(price, 1_000_000 + ppm, 1_000_000) } else { mul_div(price, 1_000_000 - ppm, 1_000_000) }
    }

    /// Price after the spread: buying pays a little more, selling gets a little less.
    fn with_spread(&self, mark: u128, buy: bool) -> u128 {
        let s = self.config.spread_bps as u128;
        if s == 0 {
            return mark;
        }
        if buy { mul_div(mark, BPS + s, BPS) } else { mul_div(mark, BPS - s, BPS) }
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "Only the owner");
    }

    fn account(&self, who: &AccountId) -> Account {
        self.accounts.get(who).cloned().expect("No account: deposit USDC first")
    }

    fn account_or_default(&self, who: &AccountId) -> Account {
        self.accounts.get(who).cloned().unwrap_or_default()
    }

    fn price_if_fresh(&self, market: &str) -> Option<u128> {
        let p = self.prices.get(market)?;
        let age = env::block_timestamp().saturating_sub(p.updated_at);
        (age <= self.config.max_price_age_sec * NANOS).then_some(p.price.0)
    }

    fn fresh_price(&self, market: &str) -> u128 {
        self.price_if_fresh(market).unwrap_or_else(|| env::panic_str("Price is stale, try again in a moment"))
    }

    fn crossed_liq(p: &Position, mark: u128) -> bool {
        if p.long { mark <= p.liq.0 } else { mark >= p.liq.0 }
    }

    fn crossed_tp(p: &Position, mark: u128) -> bool {
        match p.tp {
            Some(tp) => {
                if p.long { mark >= tp.0 } else { mark <= tp.0 }
            }
            None => false,
        }
    }

    /// Profit or loss in USDC base units at `exit`, capped between -wager and the reserved payout.
    fn pnl(p: &Position, exit: u128) -> i128 {
        let size = (p.wager.0 * p.leverage as u128) as i128;
        let entry = p.entry.0 as i128;
        let raw = size * (exit as i128 - entry) / entry * if p.long { 1 } else { -1 };
        raw.max(-(p.wager.0 as i128)).min(p.reserved.0 as i128)
    }

    fn settle(&mut self, pos: Position, exit: u128, reason: &str) -> CloseResult {
        let pnl = Self::pnl(&pos, exit);
        let mut acct = self.account_or_default(&pos.owner);
        let wager = pos.wager.0;
        let mut fee = 0u128;
        let mut minted = 0u128;
        let payout;
        let bonus = pos.bonus_virtual.0 + pos.bonus_backed.0 > 0;
        if pnl < 0 {
            let loss = (-pnl) as u128;
            // Display-only bonus credit is lost first; only real USDC losses reach the vault and earn NITRO.
            let lost_virtual = loss.min(pos.bonus_virtual.0);
            let real_loss = loss - lost_virtual;
            self.liquidity += real_loss;
            payout = wager - loss;
            minted = real_loss * self.config.nitro_per_usdc as u128;
            acct.nitro = U128(acct.nitro.0 + minted);
            self.nitro_minted += minted;
            acct.loss = U128(acct.loss.0 + real_loss);
            if bonus {
                acct.promo_bonus = U128(acct.promo_bonus.0 + payout);
                acct.promo_backed = U128(acct.promo_backed.0 + pos.bonus_backed.0 - real_loss);
            }
        } else {
            let profit = pnl as u128;
            fee = mul_div(profit, self.config.profit_fee_bps as u128, BPS);
            // The payout comes out of the vault; the fee part goes to the protocol.
            self.liquidity -= profit;
            self.fees += fee;
            payout = wager + profit - fee;
            acct.profit = U128(acct.profit.0 + profit - fee);
            if bonus {
                // Winnings made with the bonus are real USDC but stay in the bonus until the turnover.
                acct.promo_bonus = U128(acct.promo_bonus.0 + payout);
                acct.promo_backed = U128(acct.promo_backed.0 + pos.bonus_backed.0 + profit - fee);
            }
        }
        if !bonus {
            acct.balance = U128(acct.balance.0 + payout);
        }
        acct.trades += 1;
        let mut e = LedgerEntry::new("close", payout);
        e.position_id = Some(pos.id);
        e.market = Some(pos.market.clone());
        e.long = Some(pos.long);
        e.leverage = Some(pos.leverage);
        e.price = Some(U128(exit));
        e.pnl = Some(pnl.to_string());
        e.fee = Some(U128(fee));
        e.nitro = Some(U128(minted));
        e.reason = Some(reason.into());
        self.log(&pos.owner, e);
        self.reserved -= pos.reserved.0;
        self.open_interest -= wager * pos.leverage as u128;
        acct.position_ids.retain(|x| *x != pos.id);
        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"close\",\"id\":{},\"account\":\"{}\",\"pnl\":\"{}\",\"fee\":\"{}\",\"exit\":\"{}\",\"reason\":\"{}\"}}",
            pos.id, pos.owner, pnl, fee, exit, reason
        ));
        let promo = self.track_promo(&pos, &mut acct);
        self.accounts.insert(pos.owner.clone(), acct);
        self.positions.remove(&pos.id);
        if let Some((kind, bonus)) = promo {
            self.log(&pos.owner, LedgerEntry::new(kind, bonus));
        }
        CloseResult { id: pos.id, pnl: pnl.to_string(), fee: U128(fee), exit: U128(exit), reason: reason.into() }
    }

    /// Bonus turnover: count this closed position's wager (if held long enough), unlock the bonus
    /// once the turnover is reached, or end it when the balance is gone.
    fn track_promo(&mut self, pos: &Position, acct: &mut Account) -> Option<(&'static str, u128)> {
        if acct.promo_wager_required.0 == 0 {
            return None;
        }
        let held = env::block_timestamp().saturating_sub(pos.opened_at) / NANOS;
        if held >= self.config.promo_min_hold_sec {
            acct.promo_wagered = U128(acct.promo_wagered.0 + pos.wager.0);
        }
        let open_bonus: u128 = acct
            .position_ids
            .iter()
            .filter_map(|id| self.positions.get(id))
            .map(|p| p.bonus_virtual.0 + p.bonus_backed.0)
            .sum();
        if open_bonus > 0 {
            return None; // settle bonus positions first
        }
        let bonus = acct.promo_bonus.0;
        let virtual_part = bonus - acct.promo_backed.0;
        if acct.promo_wagered.0 >= acct.promo_wager_required.0 && self.liquidity - self.reserved >= virtual_part {
            // Turnover reached: the bonus becomes real, withdrawable USDC. The vault now pays the
            // display-only part; the rest is USDC already won with it.
            self.liquidity -= virtual_part;
            acct.balance = U128(acct.balance.0 + bonus);
            acct.promo_bonus = U128(0);
            acct.promo_backed = U128(0);
            acct.promo_wager_required = U128(0);
            return Some(("promo_unlocked", bonus));
        }
        if bonus < self.config.min_wager.0 {
            // Bonus used up: whatever real USDC is left in it (less than the minimum wager) goes to the vault.
            self.liquidity += acct.promo_backed.0;
            acct.promo_bonus = U128(0);
            acct.promo_backed = U128(0);
            acct.promo_wager_required = U128(0);
            return Some(("promo_ended", bonus));
        }
        None
    }

    fn send_usdc(&mut self, to: AccountId, amount: u128) -> Promise {
        self.accounted -= amount;
        self.in_flight += amount;
        self.out_seq += 1;
        let args = format!("{{\"receiver_id\":\"{}\",\"amount\":\"{}\"}}", to, amount);
        Promise::new(self.usdc.clone())
            .function_call("ft_transfer".to_string(), args.into_bytes(), NearToken::from_yoctonear(1), Gas::from_tgas(15))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(10)).on_withdraw(to, U128(amount)))
    }
}

#[cfg(test)]
mod tests;
