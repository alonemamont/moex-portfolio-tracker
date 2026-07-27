#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::error::Error;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::Manager;

const TBANK_PORTFOLIO_URL: &str = "https://invest-public-api.tbank.ru/rest/tinkoff.public.invest.api.contract.v1.OperationsService/GetPortfolio";

fn broker_sync_log_path_at(base_dir: &Path) -> PathBuf {
    base_dir.join("logs").join("broker-sync.log")
}

fn append_broker_sync_log_line_at(base_dir: &Path, line: &str) -> Result<PathBuf, String> {
    let log_path = broker_sync_log_path_at(base_dir);
    let parent = log_path
        .parent()
        .ok_or_else(|| "failed to resolve broker log directory".to_string())?;

    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| error.to_string())?;

    writeln!(file, "{line}").map_err(|error| error.to_string())?;

    Ok(log_path)
}

fn format_error_chain(error: &dyn Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut current = error.source();
    while let Some(source) = current {
        parts.push(source.to_string());
        current = source.source();
    }
    parts.join("; ")
}

#[tauri::command]
fn append_broker_sync_log(app: tauri::AppHandle, line: String) -> Result<String, String> {
    let app_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;

    let log_path = append_broker_sync_log_line_at(&app_dir, &line)?;
    Ok(log_path.display().to_string())
}

#[tauri::command]
async fn diagnose_tbank_portfolio_request(token: String, account_id: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .use_native_tls()
        .build()
        .map_err(|error| format!("reqwest client build failed: {}", format_error_chain(&error)))?;

    let response = client
        .post(TBANK_PORTFOLIO_URL)
        .bearer_auth(token)
        .json(&serde_json::json!({
            "accountId": account_id,
            "currency": "RUB",
        }))
        .send()
        .await;

    match response {
        Ok(response) => Ok(format!("direct reqwest status: {}", response.status())),
        Err(error) => Ok(format!("direct reqwest error: {}", format_error_chain(&error))),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            append_broker_sync_log,
            diagnose_tbank_portfolio_request
        ])
        .run(tauri::generate_context!())
        .expect("error while running MOEX Portfolio Tracker");
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{append_broker_sync_log_line_at, broker_sync_log_path_at, format_error_chain};

    #[test]
    fn appends_broker_sync_line_into_log_file() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let base_dir = std::env::temp_dir().join(format!("broker-sync-log-test-{unique}"));

        let log_path = append_broker_sync_log_line_at(&base_dir, "{\"stage\":\"ui.sync.start\"}")
            .expect("append broker log");

        let contents = fs::read_to_string(&log_path).expect("read broker log");
        assert!(contents.contains("{\"stage\":\"ui.sync.start\"}"));
        assert!(contents.ends_with('\n'));

        fs::remove_dir_all(&base_dir).expect("cleanup temp log dir");
    }

    #[test]
    fn builds_broker_sync_log_path_under_logs_directory() {
        let base_dir = std::path::Path::new("C:\\Users\\test\\AppData\\Local\\moex-portfolio-tracker");
        let log_path = broker_sync_log_path_at(base_dir);

        assert_eq!(log_path, base_dir.join("logs").join("broker-sync.log"));
    }

    #[test]
    fn formats_full_error_chain() {
        let error = std::io::Error::new(
            std::io::ErrorKind::ConnectionAborted,
            std::io::Error::new(std::io::ErrorKind::InvalidData, "native-tls: cert chain revoked"),
        );

        assert_eq!(
            format_error_chain(&error),
            "native-tls: cert chain revoked"
        );
    }
}
