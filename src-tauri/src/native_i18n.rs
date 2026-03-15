use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

pub const LANGUAGE_CONFIG_KEY: &str = "language";
pub const FALLBACK_LANGUAGE: &str = "en";
pub const DESKTOP_LANGUAGE_CHANGED_EVENT: &str = "language-changed";
pub const WS_ACTION_GET_LANGUAGE: &str = "get_language";
pub const WS_ACTION_LANGUAGE_INFO: &str = "language_info";
pub const WS_ACTION_LANGUAGE_CHANGED: &str = "language_changed";

const NATIVE_NAMESPACE_FILE_NAME: &str = "native.json";
const DEFAULT_SHOW_WINDOW_LABEL: &str = "Show Window";
const DEFAULT_SETTINGS_LABEL: &str = "Settings";
const DEFAULT_QUIT_LABEL: &str = "Quit FlowSelect";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StartupLanguageSource {
    Config,
    System,
    Fallback,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StartupLanguageDecision {
    pub language: &'static str,
    pub source: StartupLanguageSource,
    pub should_persist: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NativeTrayLabels {
    pub show_window: String,
    pub settings: String,
    pub quit: String,
}

impl Default for NativeTrayLabels {
    fn default() -> Self {
        Self {
            show_window: DEFAULT_SHOW_WINDOW_LABEL.to_string(),
            settings: DEFAULT_SETTINGS_LABEL.to_string(),
            quit: DEFAULT_QUIT_LABEL.to_string(),
        }
    }
}

pub fn normalize_app_language(value: Option<&str>) -> Option<&'static str> {
    let normalized = value?.trim().replace('_', "-").to_lowercase();
    if normalized.is_empty() {
        return None;
    }

    if normalized == "en" || normalized.starts_with("en-") {
        return Some("en");
    }

    if normalized == "zh" || normalized.starts_with("zh-") {
        return Some("zh-CN");
    }

    None
}

pub fn detect_system_locale() -> Option<String> {
    sys_locale::get_locale()
}

pub fn get_configured_language(config: &Value) -> Option<&'static str> {
    normalize_app_language(
        config
            .get(LANGUAGE_CONFIG_KEY)
            .and_then(|value| value.as_str()),
    )
}

pub fn resolve_language_from_config(config: &Value) -> &'static str {
    get_configured_language(config).unwrap_or(FALLBACK_LANGUAGE)
}

pub fn resolve_language_from_config_str(config_raw: &str) -> Option<&'static str> {
    let config: Value = serde_json::from_str(config_raw).ok()?;
    Some(resolve_language_from_config(&config))
}

pub fn resolve_startup_language(
    config: Option<&Value>,
    system_locale: Option<&str>,
) -> StartupLanguageDecision {
    if let Some(config) = config {
        if let Some(language) = get_configured_language(config) {
            return StartupLanguageDecision {
                language,
                source: StartupLanguageSource::Config,
                should_persist: false,
            };
        }

        if let Some(language) = normalize_app_language(system_locale) {
            return StartupLanguageDecision {
                language,
                source: StartupLanguageSource::System,
                should_persist: true,
            };
        }

        return StartupLanguageDecision {
            language: FALLBACK_LANGUAGE,
            source: StartupLanguageSource::Fallback,
            should_persist: true,
        };
    }

    if let Some(language) = normalize_app_language(system_locale) {
        return StartupLanguageDecision {
            language,
            source: StartupLanguageSource::System,
            should_persist: false,
        };
    }

    StartupLanguageDecision {
        language: FALLBACK_LANGUAGE,
        source: StartupLanguageSource::Fallback,
        should_persist: false,
    }
}

pub fn resolve_startup_language_from_config_str(
    config_raw: &str,
    system_locale: Option<&str>,
) -> StartupLanguageDecision {
    let config = serde_json::from_str::<Value>(config_raw).ok();
    resolve_startup_language(config.as_ref(), system_locale)
}

pub fn persist_resolved_language_in_config(config_raw: &str, language: &str) -> Option<String> {
    let normalized_language = normalize_app_language(Some(language))?;
    let mut config: Value = serde_json::from_str(config_raw).ok()?;
    let object = config.as_object_mut()?;
    object.insert(
        LANGUAGE_CONFIG_KEY.to_string(),
        Value::String(normalized_language.to_string()),
    );
    serde_json::to_string(&config).ok()
}

pub fn load_native_tray_labels<R: Runtime>(app: &AppHandle<R>, language: &str) -> NativeTrayLabels {
    let normalized_language = normalize_app_language(Some(language)).unwrap_or(FALLBACK_LANGUAGE);
    let primary_document = load_native_locale_document(app, normalized_language);
    let fallback_document = if normalized_language == FALLBACK_LANGUAGE {
        None
    } else {
        load_native_locale_document(app, FALLBACK_LANGUAGE)
    };

    NativeTrayLabels {
        show_window: resolve_label(
            normalized_language,
            "tray.show",
            DEFAULT_SHOW_WINDOW_LABEL,
            primary_document.as_ref(),
            fallback_document.as_ref(),
            &["tray", "show"],
        ),
        settings: resolve_label(
            normalized_language,
            "tray.settings",
            DEFAULT_SETTINGS_LABEL,
            primary_document.as_ref(),
            fallback_document.as_ref(),
            &["tray", "settings"],
        ),
        quit: resolve_label(
            normalized_language,
            "tray.quit",
            DEFAULT_QUIT_LABEL,
            primary_document.as_ref(),
            fallback_document.as_ref(),
            &["tray", "quit"],
        ),
    }
}

fn resolve_label(
    language: &str,
    key: &str,
    default: &str,
    primary_document: Option<&Value>,
    fallback_document: Option<&Value>,
    key_path: &[&str],
) -> String {
    if let Some(value) = lookup_nested_string(primary_document, key_path) {
        return value;
    }

    if let Some(value) = lookup_nested_string(fallback_document, key_path) {
        println!(
            ">>> [Rust] Missing native locale key {} for {}, using English fallback",
            key, language
        );
        return value;
    }

    println!(
        ">>> [Rust] Missing native locale key {} for {}, using built-in default",
        key, language
    );
    default.to_string()
}

fn load_native_locale_document<R: Runtime>(app: &AppHandle<R>, language: &str) -> Option<Value> {
    for path in candidate_locale_paths(app, language) {
        match fs::read_to_string(&path) {
            Ok(contents) => match serde_json::from_str::<Value>(&contents) {
                Ok(document) => return Some(document),
                Err(err) => {
                    println!(
                        ">>> [Rust] Failed to parse native locale {}: {}",
                        path.display(),
                        err
                    );
                }
            },
            Err(err) if err.kind() == ErrorKind::NotFound => {}
            Err(err) => {
                println!(
                    ">>> [Rust] Failed to read native locale {}: {}",
                    path.display(),
                    err
                );
            }
        }
    }

    None
}

fn candidate_locale_paths<R: Runtime>(app: &AppHandle<R>, language: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        paths.push(
            resource_dir
                .join("locales")
                .join(language)
                .join(NATIVE_NAMESPACE_FILE_NAME),
        );
    }

    let manifest_resource_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("locales")
        .join(language)
        .join(NATIVE_NAMESPACE_FILE_NAME);
    if !paths.iter().any(|path| path == &manifest_resource_path) {
        paths.push(manifest_resource_path);
    }

    paths
}

fn lookup_nested_string(document: Option<&Value>, key_path: &[&str]) -> Option<String> {
    let mut current = document?;
    for key in key_path {
        current = current.get(*key)?;
    }

    current.as_str().map(|value| value.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_english_variants_to_en() {
        assert_eq!(normalize_app_language(Some("en")), Some("en"));
        assert_eq!(normalize_app_language(Some("EN_us")), Some("en"));
        assert_eq!(normalize_app_language(Some("en-GB")), Some("en"));
    }

    #[test]
    fn normalizes_chinese_variants_to_zh_cn() {
        assert_eq!(normalize_app_language(Some("zh")), Some("zh-CN"));
        assert_eq!(normalize_app_language(Some("zh-Hans")), Some("zh-CN"));
        assert_eq!(normalize_app_language(Some("zh_TW")), Some("zh-CN"));
    }

    #[test]
    fn resolves_language_from_config_with_english_fallback() {
        let config = serde_json::json!({});
        assert_eq!(resolve_language_from_config(&config), "en");

        let config = serde_json::json!({ "language": "zh" });
        assert_eq!(resolve_language_from_config(&config), "zh-CN");

        let config = serde_json::json!({ "language": "fr-FR" });
        assert_eq!(resolve_language_from_config(&config), "en");
    }

    #[test]
    fn resolves_startup_language_from_saved_config_without_persisting() {
        let config = serde_json::json!({ "language": "en-GB" });
        let decision = resolve_startup_language(Some(&config), Some("zh-CN"));

        assert_eq!(
            decision,
            StartupLanguageDecision {
                language: "en",
                source: StartupLanguageSource::Config,
                should_persist: false,
            }
        );
    }

    #[test]
    fn resolves_startup_language_from_system_locale_when_config_language_is_missing() {
        let config = serde_json::json!({ "theme": "black" });
        let decision = resolve_startup_language(Some(&config), Some("zh-Hant"));

        assert_eq!(
            decision,
            StartupLanguageDecision {
                language: "zh-CN",
                source: StartupLanguageSource::System,
                should_persist: true,
            }
        );
    }

    #[test]
    fn avoids_persisting_startup_language_when_config_json_is_invalid() {
        let decision = resolve_startup_language_from_config_str("{", Some("zh-CN"));

        assert_eq!(
            decision,
            StartupLanguageDecision {
                language: "zh-CN",
                source: StartupLanguageSource::System,
                should_persist: false,
            }
        );
    }

    #[test]
    fn persists_resolved_language_without_clobbering_other_config_keys() {
        let persisted =
            persist_resolved_language_in_config(r#"{"theme":"black","language":"fr-FR"}"#, "zh")
                .expect("language should persist");
        let parsed: Value =
            serde_json::from_str(&persisted).expect("persisted config should parse");

        assert_eq!(
            parsed.get("theme"),
            Some(&Value::String("black".to_string()))
        );
        assert_eq!(
            parsed.get("language"),
            Some(&Value::String("zh-CN".to_string()))
        );
    }

    #[test]
    fn falls_back_to_english_document_when_primary_key_is_missing() {
        let primary = serde_json::json!({
            "_meta": { "surface": "native" },
            "tray": {}
        });
        let fallback = serde_json::json!({
            "_meta": { "surface": "native" },
            "tray": { "show": "Show Window" }
        });

        let resolved = resolve_label(
            "zh-CN",
            "tray.show",
            DEFAULT_SHOW_WINDOW_LABEL,
            Some(&primary),
            Some(&fallback),
            &["tray", "show"],
        );

        assert_eq!(resolved, "Show Window");
    }
}
