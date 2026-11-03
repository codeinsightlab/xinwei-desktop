//! Validate the dated facts before accepting them as a valid local file or backup.
//! The TypeScript domain owns the salary and dialogue rules.
use chrono::NaiveDate;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Ledger {
    version: u8,
    first_used_date: NaiveDate,
    last_interaction_date: Option<NaiveDate>,
    policy: Policy,
    days: BTreeMap<NaiveDate, Day>,
    receipts: BTreeMap<String, Receipt>,
    batches: BTreeMap<String, Vec<NaiveDate>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Policy {
    mode: Mode,
    grace_minutes: u16,
    per_minute_minor: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum Mode {
    None,
    PerMinute,
}
impl Policy {
    fn valid(&self) -> bool {
        self.grace_minutes <= 60
            && self.per_minute_minor <= 999_999
            && (!matches!(self.mode, Mode::PerMinute) || self.per_minute_minor > 0)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Day {
    work_date: NaiveDate,
    state: State,
    source: Source,
    first_started_at: Option<u64>,
    ended_at: Option<u64>,
    snapshot: Snapshot,
    revision: u64,
    late_seconds: u64,
    charged_minutes: u64,
    deduction_minor: u64,
    batch_id: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum State {
    Active,
    Closed,
    PendingEnd,
    Estimated,
}
#[derive(Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum Source {
    User,
    EstimatedCatchup,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    version: u8,
    salary_minor: u64,
    month_seconds: u64,
    intervals: Vec<Interval>,
    time_zone: String,
    policy: Policy,
}
#[derive(Deserialize)]
struct Interval {
    start: u64,
    end: u64,
    date: NaiveDate,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Receipt {
    event_id: String,
    scene_id: String,
    message_id: String,
}

impl Day {
    fn valid(&self, key: NaiveDate) -> bool {
        let snapshot = &self.snapshot;
        if self.work_date != key
            || self.revision == 0
            || snapshot.version != 1
            || snapshot.time_zone != "Asia/Shanghai"
            || !(1..=9_999_999_999).contains(&snapshot.salary_minor)
            || !(1..=31 * 86400).contains(&snapshot.month_seconds)
            || !snapshot.policy.valid()
            || snapshot.intervals.is_empty()
            || self.late_seconds > 86400
            || self.charged_minutes > 1440
            || self.deduction_minor > 1440 * 999_999
        {
            return false;
        }
        let start = key.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp() - 8 * 3600;
        let is_today = |ms: u64| (start * 1000..(start + 86400) * 1000).contains(&(ms as i64));
        let mut prev = start;
        for interval in &snapshot.intervals {
            if interval.date != key
                || (interval.start as i64) < prev
                || interval.end <= interval.start
                || interval.end as i64 > start + 86400
            {
                return false;
            }
            prev = interval.end as i64;
        }
        match (
            &self.state,
            &self.source,
            self.first_started_at,
            self.ended_at,
        ) {
            (State::Estimated, Source::EstimatedCatchup, None, None) => {
                self.deduction_minor == 0 && self.batch_id.is_some()
            }
            (State::Closed, Source::User, Some(a), Some(b)) => is_today(a) && is_today(b) && b >= a,
            (State::Active | State::PendingEnd, Source::User, Some(a), None) => is_today(a),
            _ => false,
        }
    }
}

pub fn validate(value: &Value) -> Result<(), String> {
    let ledger: Ledger =
        serde_json::from_value(value.clone()).map_err(|_| "互动记录字段无法读取")?;
    if ledger.version != 1
        || !ledger.policy.valid()
        || ledger
            .last_interaction_date
            .is_some_and(|d| d < ledger.first_used_date)
        || !ledger.days.iter().all(|(key, day)| day.valid(*key))
        || !ledger.receipts.iter().all(|(key, r)| {
            key == &r.event_id && !r.scene_id.is_empty() && !r.message_id.is_empty()
        })
        || !ledger.batches.iter().all(|(batch, dates)| {
            dates.iter().all(|d| {
                ledger
                    .days
                    .get(d)
                    .is_some_and(|day| day.batch_id.as_ref() == Some(batch))
            })
        })
    {
        return Err("互动记录内容无法读取".into());
    }
    Ok(())
}
