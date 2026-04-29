mod analysis;
mod db;
mod error;
mod repo;

use std::sync::Arc;

use tauri::Manager;

use crate::analysis::{
    get_activity_patterns_impl, get_code_churn_impl, get_commit_heatmap_impl,
    get_commit_message_stats_impl, get_commit_timeline_impl, get_contributor_detail_impl,
    get_contributor_heatmap_impl, get_contributor_recent_commits_impl,
    get_contributor_top_files_impl, get_file_hotspots_impl, get_language_breakdown_impl,
    get_ownership_report_impl, get_recent_commits_impl, get_repo_summary_impl,
    get_repos_sparklines_impl, get_top_contributors_impl, list_branches_impl, list_tags_impl,
    search_commits_impl, ActivityPatterns, BranchInfo, ChurnPoint, CommitInfo, CommitMessageStats,
    Contributor, ContributorDetail, FileHotspot, HeatmapData, LanguageStat, OwnershipReport,
    RepoSparkline, RepoSummary, SearchParams, TagInfo, TimelinePoint,
};
use crate::db::{default_db_path, Db};
use crate::error::AppResult;
use crate::repo::{
    add_repository_impl, list_repositories_impl, remove_repository_impl, scan_folder_impl,
    Repository,
};

pub struct AppState {
    db: Arc<Db>,
}

#[tauri::command]
async fn add_repository(state: tauri::State<'_, AppState>, path: String) -> AppResult<Repository> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || add_repository_impl(&db, &path))
        .await
        .unwrap()
}

#[tauri::command]
async fn list_repositories(state: tauri::State<'_, AppState>) -> AppResult<Vec<Repository>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || list_repositories_impl(&db))
        .await
        .unwrap()
}

#[tauri::command]
async fn remove_repository(state: tauri::State<'_, AppState>, id: i64) -> AppResult<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || remove_repository_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn scan_folder(
    state: tauri::State<'_, AppState>,
    folder: String,
) -> AppResult<Vec<Repository>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || scan_folder_impl(&db, &folder))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_repo_summary(state: tauri::State<'_, AppState>, id: i64) -> AppResult<RepoSummary> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_repo_summary_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_commit_heatmap(
    state: tauri::State<'_, AppState>,
    id: i64,
    year: i32,
) -> AppResult<HeatmapData> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_commit_heatmap_impl(&db, id, year))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_commit_timeline(
    state: tauri::State<'_, AppState>,
    id: i64,
    granularity: String,
) -> AppResult<Vec<TimelinePoint>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_commit_timeline_impl(&db, id, &granularity))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_top_contributors(
    state: tauri::State<'_, AppState>,
    id: i64,
    limit: usize,
) -> AppResult<Vec<Contributor>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_top_contributors_impl(&db, id, limit))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_recent_commits(
    state: tauri::State<'_, AppState>,
    id: i64,
    limit: usize,
) -> AppResult<Vec<CommitInfo>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_recent_commits_impl(&db, id, limit))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_language_breakdown(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<Vec<LanguageStat>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_language_breakdown_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_code_churn(
    state: tauri::State<'_, AppState>,
    id: i64,
    granularity: String,
) -> AppResult<Vec<ChurnPoint>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_code_churn_impl(&db, id, &granularity))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_file_hotspots(
    state: tauri::State<'_, AppState>,
    id: i64,
    limit: usize,
) -> AppResult<Vec<FileHotspot>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_file_hotspots_impl(&db, id, limit))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_activity_patterns(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<ActivityPatterns> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_activity_patterns_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_commit_message_stats(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<CommitMessageStats> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_commit_message_stats_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn list_tags(state: tauri::State<'_, AppState>, id: i64) -> AppResult<Vec<TagInfo>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || list_tags_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_repos_sparklines(
    state: tauri::State<'_, AppState>,
    days: i64,
) -> AppResult<Vec<RepoSparkline>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_repos_sparklines_impl(&db, days))
        .await
        .unwrap()
}

#[tauri::command]
async fn list_branches(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<Vec<BranchInfo>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || list_branches_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_contributor_detail(
    state: tauri::State<'_, AppState>,
    id: i64,
    email: String,
) -> AppResult<ContributorDetail> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_contributor_detail_impl(&db, id, &email))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_contributor_heatmap(
    state: tauri::State<'_, AppState>,
    id: i64,
    email: String,
    year: i32,
) -> AppResult<HeatmapData> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_contributor_heatmap_impl(&db, id, &email, year)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn get_contributor_top_files(
    state: tauri::State<'_, AppState>,
    id: i64,
    email: String,
    limit: usize,
) -> AppResult<Vec<FileHotspot>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_contributor_top_files_impl(&db, id, &email, limit)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn get_contributor_recent_commits(
    state: tauri::State<'_, AppState>,
    id: i64,
    email: String,
    limit: usize,
) -> AppResult<Vec<CommitInfo>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_contributor_recent_commits_impl(&db, id, &email, limit)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn search_commits(
    state: tauri::State<'_, AppState>,
    id: i64,
    params: SearchParams,
) -> AppResult<Vec<CommitInfo>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || search_commits_impl(&db, id, params))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_ownership_report(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<OwnershipReport> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_ownership_report_impl(&db, id))
        .await
        .unwrap()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let db_path = default_db_path()?;
            let db = Db::open(db_path).map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;
            app.manage(AppState { db: Arc::new(db) });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            add_repository,
            list_repositories,
            remove_repository,
            scan_folder,
            get_repo_summary,
            get_commit_heatmap,
            get_commit_timeline,
            get_top_contributors,
            get_recent_commits,
            get_language_breakdown,
            get_code_churn,
            get_file_hotspots,
            get_activity_patterns,
            get_commit_message_stats,
            list_tags,
            get_repos_sparklines,
            list_branches,
            get_contributor_detail,
            get_contributor_heatmap,
            get_contributor_top_files,
            get_contributor_recent_commits,
            search_commits,
            get_ownership_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
