use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub amount_minor: u64,
    pub basis: String,
    pub weekdays: Vec<u8>,
    pub start: u16,
    pub end: u16,
    pub break_enabled: bool,
    pub break_start: u16,
    pub break_end: u16,
    pub time_zone: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    #[serde(default = "default_rolling_amount")]
    pub rolling_amount: bool,
    pub privacy_mode: bool,
    pub always_on_top: bool,
    pub show_fun_text: bool,
    pub fun_mode: bool,
    pub launch_at_login: bool,
    pub show_widget_on_launch: bool,
    pub close_hint_seen: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engagement: Option<serde_json::Value>,
    pub schema_version: u32,
    pub revision: u64,
    pub profile: Option<Profile>,
    pub overrides: BTreeMap<String, String>,
    pub preferences: Preferences,
}
fn default_rolling_amount() -> bool {
    true
}

impl Default for Config {
    fn default() -> Self {
        Self {
            engagement: None,
            schema_version: 1,
            revision: 0,
            profile: None,
            overrides: BTreeMap::new(),
            preferences: Preferences {
                rolling_amount: true,
                privacy_mode: false,
                always_on_top: true,
                show_fun_text: true,
                fun_mode: false,
                launch_at_login: false,
                show_widget_on_launch: true,
                close_hint_seen: false,
            },
        }
    }
}
impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if let Some(ledger) = &self.engagement {
            crate::engagement::validate(ledger)?;
        }
        if self.schema_version != 1 || self.revision > 9_007_199_254_740_990 {
            return Err("配置版本无法读取".into());
        }
        if let Some(p) = &self.profile {
            if !(1..=9_999_999_999).contains(&p.amount_minor) {
                return Err("月薪超出范围".into());
            }
            if p.basis.trim().is_empty()
                || p.basis.chars().count() > 12
                || p.time_zone != "Asia/Shanghai"
            {
                return Err("工资口径或时区无效".into());
            }
            let mut days = p.weekdays.clone();
            days.sort();
            days.dedup();
            if days.is_empty()
                || days.len() != p.weekdays.len()
                || days.iter().any(|d| *d < 1 || *d > 7)
            {
                return Err("请至少选择一个工作日".into());
            }
            if [p.start, p.end, p.break_start, p.break_end]
                .iter()
                .any(|t| *t >= 1440)
                || p.start >= p.end
            {
                return Err("上下班时间无效，暂不支持跨夜".into());
            }
            if p.break_enabled
                && !(p.start < p.break_start && p.break_start < p.break_end && p.break_end < p.end)
            {
                return Err("午休必须在上下班之间".into());
            }
        }
        for (date, kind) in &self.overrides {
            let parsed =
                chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").map_err(|_| "日期配置无效")?;
            if parsed.format("%Y-%m-%d").to_string() != *date
                || !["work", "rest"].contains(&kind.as_str())
            {
                return Err("日期配置无效".into());
            }
        }
        Ok(())
    }
}
pub fn parse(bytes: &[u8]) -> Result<Config, String> {
    let mut value: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| "配置文件损坏")?;
    // Version 0 is the explicitly supported predecessor; unknown future versions stay untouched.
    if value.get("schemaVersion").and_then(|v| v.as_u64()) == Some(0) {
        value["schemaVersion"] = 1.into();
        if value.get("overrides").is_none() {
            value["overrides"] = serde_json::json!({});
        }
        let defaults =
            serde_json::to_value(Config::default().preferences).map_err(|_| "迁移失败")?;
        if let Some(prefs) = value.get_mut("preferences").and_then(|v| v.as_object_mut()) {
            for (key, val) in defaults.as_object().unwrap() {
                prefs.entry(key).or_insert_with(|| val.clone());
            }
        }
    }
    let config: Config = serde_json::from_value(value).map_err(|_| "配置字段无法读取")?;
    config.validate()?;
    Ok(config)
}
pub struct Store {
    pub directory: PathBuf,
    pub config: Config,
    pub notice: Option<String>,
    pub recovery_required: bool,
}
impl Store {
    pub fn open(directory: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&directory).map_err(|_| "无法创建应用数据目录")?;
        let path = directory.join("config.json");
        if !path.exists() && !directory.join("config.backup.json").exists() {
            return Ok(Self {
                directory,
                config: Config::default(),
                notice: None,
                recovery_required: false,
            });
        }
        if let Ok(bytes) = fs::read(&path) {
            if let Ok(config) = parse(&bytes) {
                return Ok(Self {
                    directory,
                    config,
                    notice: None,
                    recovery_required: false,
                });
            }
        }
        if let Ok(bytes) = fs::read(directory.join("config.backup.json")) {
            if let Ok(config) = parse(&bytes) {
                return Ok(Self {
                    directory,
                    config,
                    notice: Some("已从最近有效备份恢复，请检查设置后保存。".into()),
                    recovery_required: false,
                });
            }
        }
        Ok(Self {
            directory,
            config: Config::default(),
            notice: Some("配置无法读取，原始文件已保留。可以重新设置，损坏文件将另行保留。".into()),
            recovery_required: true,
        })
    }
    pub fn commit(&mut self, mut config: Config, expected: u64) -> Result<Config, String> {
        if self.recovery_required {
            return Err("请先选择恢复或重新设置".into());
        }
        if self.config.revision != expected {
            return Err("设置已在其他入口更新。草稿已保留，请重新预览后保存。".into());
        }
        config.revision = expected + 1;
        config.validate()?;
        let path = self.directory.join("config.json");
        if let Ok(bytes) = fs::read(&path) {
            if parse(&bytes).is_ok() {
                atomic_write(&self.directory.join("config.backup.json"), &bytes)?;
            } else {
                self.preserve_damaged()?;
            }
        }
        let bytes = serde_json::to_vec_pretty(&config).map_err(|_| "无法编码配置")?;
        atomic_write(&path, &bytes)?;
        // First save also has a valid backup; later backups retain the previous successful revision.
        if !self.directory.join("config.backup.json").exists() {
            let _ = atomic_write(&self.directory.join("config.backup.json"), &bytes);
        }
        self.config = config.clone();
        self.notice = None;
        Ok(config)
    }
    pub fn preserve_damaged(&self) -> Result<(), String> {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        if self.directory.join("config.json").exists() {
            fs::copy(
                self.directory.join("config.json"),
                self.directory.join(format!("config.corrupt-{stamp}.json")),
            )
            .map_err(|_| "无法保留原始配置")?;
        }
        Ok(())
    }
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("json.tmp");
    let mut file =
        File::create(&temporary).map_err(|_| "无法写入配置，请检查磁盘空间和目录权限")?;
    file.write_all(bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "写入配置失败，旧配置已保留")?;
    drop(file);
    replace(&temporary, path).map_err(|e| {
        format!(
            "无法安全替换配置，旧配置已保留（系统代码 {}）",
            e.raw_os_error().unwrap_or(0)
        )
    })
}
#[cfg(windows)]
fn replace(from: &Path, to: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let a: Vec<u16> = from.as_os_str().encode_wide().chain(Some(0)).collect();
    let b: Vec<u16> = to.as_os_str().encode_wide().chain(Some(0)).collect();
    for attempt in 0..4 {
        if unsafe {
            MoveFileExW(
                a.as_ptr(),
                b.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        } != 0
        {
            return Ok(());
        }
        let error = std::io::Error::last_os_error();
        if attempt == 3 || !matches!(error.raw_os_error(), Some(5 | 32 | 33)) {
            return Err(error);
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }
    unreachable!()
}
#[cfg(not(windows))]
fn replace(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::rename(from, to)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rolling_preference_defaults_and_roundtrips() {
        let mut old = serde_json::to_value(Config::default()).unwrap();
        old["preferences"]
            .as_object_mut()
            .unwrap()
            .remove("rollingAmount");
        let mut config = parse(&serde_json::to_vec(&old).unwrap()).unwrap();
        assert!(config.preferences.rolling_amount);
        config.preferences.rolling_amount = false;
        assert!(
            !parse(&serde_json::to_vec(&config).unwrap())
                .unwrap()
                .preferences
                .rolling_amount
        );
    }
    fn directory() -> PathBuf {
        std::env::temp_dir().join(format!(
            "xinwei-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }
    #[test]
    fn backup_and_stale_revision() {
        let dir = directory();
        let mut store = Store::open(dir.clone()).unwrap();
        let c = store.commit(Config::default(), 0).unwrap();
        assert_eq!(c.revision, 1);
        assert!(store.commit(c.clone(), 0).is_err());
        let mut changed = c.clone();
        changed.preferences.privacy_mode = true;
        store.commit(changed, 1).unwrap();
        fs::write(dir.join("config.json"), b"broken").unwrap();
        let recovered = Store::open(dir.clone()).unwrap();
        assert_eq!(recovered.config.revision, 1);
        assert!(recovered.notice.is_some());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn engagement_survives_restart_and_rejects_stale_writers() {
        let dir = directory();
        let mut store = Store::open(dir.clone()).unwrap();
        let winner = serde_json::json!({
            "version":1,"firstUsedDate":"2026-11-03",
            "policy":{"mode":"NONE","graceMinutes":0,"perMinuteMinor":0},
            "days":{},"receipts":{},"batches":{}
        });
        let mut config = store.config.clone();
        assert!(config.engagement.is_none());
        config.engagement = Some(winner.clone());
        store.commit(config.clone(),0).unwrap();
        let mut damaged = winner.clone();
        damaged["days"]["2026-11-03"] = serde_json::json!({"state":"ACTIVE"});
        config.engagement = Some(damaged);
        assert!(store.commit(config,1).is_err());
        assert!(store.commit(Config::default(),0).is_err());
        let loaded = Store::open(dir.clone()).unwrap();
        assert_eq!(loaded.config.engagement,Some(winner));
        assert_eq!(loaded.config.revision,1);
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn corrupt_is_not_silently_reset() {
        let dir = directory();
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("config.json"), b"broken").unwrap();
        let mut store = Store::open(dir.clone()).unwrap();
        assert!(store.recovery_required);
        assert!(store.commit(Config::default(), 0).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn future_version_rejected() {
        let mut c = Config::default();
        c.schema_version = 2;
        assert!(parse(&serde_json::to_vec(&c).unwrap()).is_err());
    }
}
