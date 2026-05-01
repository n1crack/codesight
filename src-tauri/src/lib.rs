mod analysis;
mod db;
mod error;
mod repo;

use std::sync::Arc;

use tauri::Manager;

use crate::analysis::{
    get_activity_patterns_impl, get_code_churn_impl, get_commit_detail_impl,
    get_commit_graph_impl, get_commit_heatmap_impl, get_commit_message_stats_impl,
    get_commit_timeline_impl, get_contributor_detail_impl, get_contributor_heatmap_impl,
    get_contributor_recent_commits_impl, get_contributor_top_files_impl,
    get_churn_risk_impl, get_coauthor_pairs_impl, get_contributor_cohort_impl,
    get_directory_hotspots_impl, get_file_couplings_impl, get_file_hotspots_impl,
    get_global_heatmap_impl,
    get_global_recent_commits_impl, get_global_summary_impl, get_language_breakdown_impl,
    get_ownership_report_impl, get_recent_commits_impl, get_repo_health_impl,
    get_repo_summary_impl, get_repos_sparklines_impl, get_top_contributors_impl,
    list_branches_impl, list_known_authors_impl, list_tags_impl, search_commits_impl,
    ActivityPatterns, BranchInfo, ChurnPoint, ChurnRiskFile, CoauthorPair, CommitDetail,
    CommitInfo, CommitMessageStats, Contributor, ContributorCohortPoint, ContributorDetail,
    DirectoryHotspot, FileCoupling, FileHotspot, GlobalRecentCommit, GlobalSummary, GraphCommit,
    HeatmapData, LanguageStat, OwnershipReport, RepoHealth, RepoSparkline, RepoSummary,
    SearchParams, TagInfo, TimelinePoint,
};
use crate::db::{default_db_path, Db};
use crate::error::AppResult;
use crate::repo::{
    add_repository_impl, assign_tag_impl, create_tag_impl, delete_tag_impl,
    list_repositories_impl, list_tags_with_stats_impl, remove_repository_impl, scan_folder_impl,
    set_tag_repos_impl, unassign_tag_impl, update_tag_impl, Repository, Tag, TagWithStats,
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
async fn refresh_repo(state: tauri::State<'_, AppState>, id: i64) -> AppResult<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || db.invalidate_cache(id))
        .await
        .unwrap()
}

#[tauri::command]
async fn create_tag(
    state: tauri::State<'_, AppState>,
    name: String,
    color: String,
) -> AppResult<Tag> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || create_tag_impl(&db, &name, &color))
        .await
        .unwrap()
}

#[tauri::command]
async fn update_tag(
    state: tauri::State<'_, AppState>,
    id: i64,
    name: Option<String>,
    color: Option<String>,
) -> AppResult<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || update_tag_impl(&db, id, name, color))
        .await
        .unwrap()
}

#[tauri::command]
async fn delete_tag(state: tauri::State<'_, AppState>, id: i64) -> AppResult<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || delete_tag_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn list_repo_tags(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<TagWithStats>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || list_tags_with_stats_impl(&db))
        .await
        .unwrap()
}

#[tauri::command]
async fn assign_tag(
    state: tauri::State<'_, AppState>,
    repo_id: i64,
    tag_id: i64,
) -> AppResult<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || assign_tag_impl(&db, repo_id, tag_id))
        .await
        .unwrap()
}

#[tauri::command]
async fn unassign_tag(
    state: tauri::State<'_, AppState>,
    repo_id: i64,
    tag_id: i64,
) -> AppResult<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || unassign_tag_impl(&db, repo_id, tag_id))
        .await
        .unwrap()
}

#[tauri::command]
async fn set_tag_repos(
    state: tauri::State<'_, AppState>,
    tag_id: i64,
    repo_ids: Vec<i64>,
) -> AppResult<()> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || set_tag_repos_impl(&db, tag_id, repo_ids))
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
    since: Option<String>,
) -> AppResult<Vec<FileHotspot>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_file_hotspots_impl(&db, id, limit, since))
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
    since: Option<String>,
) -> AppResult<CommitMessageStats> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_commit_message_stats_impl(&db, id, since)
    })
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
    since: Option<String>,
) -> AppResult<OwnershipReport> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_ownership_report_impl(&db, id, since))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_commit_graph(
    state: tauri::State<'_, AppState>,
    id: i64,
    limit: usize,
) -> AppResult<Vec<GraphCommit>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_commit_graph_impl(&db, id, limit))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_commit_detail(
    state: tauri::State<'_, AppState>,
    id: i64,
    oid: String,
) -> AppResult<CommitDetail> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_commit_detail_impl(&db, id, &oid))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_global_summary(
    state: tauri::State<'_, AppState>,
    email: Option<String>,
    tag_id: Option<i64>,
) -> AppResult<GlobalSummary> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_global_summary_impl(&db, email, tag_id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_global_heatmap(
    state: tauri::State<'_, AppState>,
    year: i32,
    email: Option<String>,
    tag_id: Option<i64>,
) -> AppResult<HeatmapData> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_global_heatmap_impl(&db, year, email, tag_id)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn get_global_recent_commits(
    state: tauri::State<'_, AppState>,
    limit: usize,
    email: Option<String>,
    tag_id: Option<i64>,
) -> AppResult<Vec<GlobalRecentCommit>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_global_recent_commits_impl(&db, limit, email, tag_id)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn list_known_authors(
    state: tauri::State<'_, AppState>,
    tag_id: Option<i64>,
) -> AppResult<Vec<Contributor>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || list_known_authors_impl(&db, tag_id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_coauthor_pairs(
    state: tauri::State<'_, AppState>,
    id: i64,
    limit: usize,
) -> AppResult<Vec<CoauthorPair>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_coauthor_pairs_impl(&db, id, limit))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_file_couplings(
    state: tauri::State<'_, AppState>,
    id: i64,
    limit: usize,
    since: Option<String>,
) -> AppResult<Vec<FileCoupling>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_file_couplings_impl(&db, id, limit, since))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_directory_hotspots(
    state: tauri::State<'_, AppState>,
    id: i64,
    max_depth: usize,
    limit: usize,
    since: Option<String>,
) -> AppResult<Vec<DirectoryHotspot>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_directory_hotspots_impl(&db, id, max_depth, limit, since)
    })
    .await
    .unwrap()
}

#[tauri::command]
async fn get_repo_health(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<RepoHealth> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_repo_health_impl(&db, id))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_churn_risk(
    state: tauri::State<'_, AppState>,
    id: i64,
    limit: usize,
    since: Option<String>,
) -> AppResult<Vec<ChurnRiskFile>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_churn_risk_impl(&db, id, limit, since))
        .await
        .unwrap()
}

#[tauri::command]
async fn get_contributor_cohort(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> AppResult<Vec<ContributorCohortPoint>> {
    let db = state.db.clone();
    tauri::async_runtime::spawn_blocking(move || get_contributor_cohort_impl(&db, id))
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
            refresh_repo,
            create_tag,
            update_tag,
            delete_tag,
            list_repo_tags,
            assign_tag,
            unassign_tag,
            set_tag_repos,
            get_coauthor_pairs,
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
            get_commit_graph,
            get_commit_detail,
            get_global_summary,
            get_global_heatmap,
            get_global_recent_commits,
            list_known_authors,
            get_file_couplings,
            get_directory_hotspots,
            get_repo_health,
            get_churn_risk,
            get_contributor_cohort,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
