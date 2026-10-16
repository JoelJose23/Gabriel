use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;
use serde::Serialize;

/// Maximum number of events retained in the ring buffer.
const CAPACITY: usize = 500;

#[derive(Debug, Clone, Serialize)]
pub struct EventEntry {
    pub seq: u64,
    pub ts_unix_ms: u64,
    /// One of `info`, `warn`, `error`.
    pub level: String,
    /// Subsystem that produced the event (`engine`, `model`, `config`, ...).
    pub source: String,
    pub message: String,
}

/// In-memory ring buffer of engine lifecycle events, exposed to the UI
/// through `GET /v1/system/events?after=<seq>`.
#[derive(Debug, Default)]
pub struct EventLog {
    entries: Mutex<VecDeque<EventEntry>>,
    next_seq: AtomicU64,
}

impl EventLog {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, level: &str, source: &str, message: impl Into<String>) -> u64 {
        let seq = self.next_seq.fetch_add(1, Ordering::Relaxed) + 1;
        let ts_unix_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or_default();

        let mut entries = self.entries.lock();
        if entries.len() >= CAPACITY {
            entries.pop_front();
        }
        entries.push_back(EventEntry {
            seq,
            ts_unix_ms,
            level: level.to_string(),
            source: source.to_string(),
            message: message.into(),
        });
        seq
    }

    /// All events with `seq > after`, oldest first.
    pub fn since(&self, after: u64) -> Vec<EventEntry> {
        self.entries
            .lock()
            .iter()
            .filter(|e| e.seq > after)
            .cloned()
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_are_monotonic_and_filterable() {
        let log = EventLog::new();
        let a = log.record("info", "engine", "one");
        let b = log.record("warn", "model", "two");
        assert!(b > a);

        let all = log.since(0);
        assert_eq!(all.len(), 2);
        let tail = log.since(a);
        assert_eq!(tail.len(), 1);
        assert_eq!(tail[0].message, "two");
    }

    #[test]
    fn ring_buffer_evicts_oldest() {
        let log = EventLog::new();
        for i in 0..(CAPACITY + 10) {
            log.record("info", "engine", format!("event {i}"));
        }
        let all = log.since(0);
        assert_eq!(all.len(), CAPACITY);
        assert_eq!(all[0].seq, 11);
    }
}
