import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ArrowLeft } from "lucide-react";

import { api } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { DiffView } from "@/components/DiffView";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDateTime } from "@/lib/format";

export function CommitDetailPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { oid } = useParams<{ oid: string }>();
  const [searchParams] = useSearchParams();
  const { selectedRepoId, setSelectedRepoId } = useAppState();

  const repoIdFromUrl = useMemo(() => {
    const raw = searchParams.get("repo");
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const effectiveRepoId = repoIdFromUrl ?? selectedRepoId;

  useEffect(() => {
    if (repoIdFromUrl != null && repoIdFromUrl !== selectedRepoId) {
      setSelectedRepoId(repoIdFromUrl);
    }
  }, [repoIdFromUrl, selectedRepoId, setSelectedRepoId]);

  const detail = useQuery({
    queryKey: ["commitDetail", effectiveRepoId, oid],
    queryFn: () => api.getCommitDetail(effectiveRepoId!, oid!),
    enabled: effectiveRepoId != null && !!oid,
  });

  if (effectiveRepoId == null) {
    return (
      <>
        <PageHeader title={t("commit.title")} />
        <EmptyState>{t("commit.selectRepoFirst")}</EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={detail.data?.summary ?? t("commit.title")}
        subtitle={detail.data ? `${detail.data.shortId}` : oid?.slice(0, 7)}
        actions={
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            <ArrowLeft size={14} /> {t("commit.back")}
          </button>
        }
      />
      <div className="flex flex-col gap-4 p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("commit.fullMessage")}</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.isPending ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : detail.data ? (
              <>
                <pre className="whitespace-pre-wrap font-mono text-sm text-foreground">
                  {detail.data.message.trim()}
                </pre>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <Link
                    to={`/contributors/${encodeURIComponent(detail.data.authorEmail)}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {detail.data.authorName}
                  </Link>
                  <span>
                    {formatDateTime(detail.data.timestamp, i18n.language)}
                  </span>
                  <span className="font-mono">{detail.data.shortId}</span>
                  <span>
                    {t("commit.filesChanged", { count: detail.data.filesChanged })}
                  </span>
                  <span className="text-emerald-500">
                    +{detail.data.insertions}
                  </span>
                  <span className="text-rose-500">
                    -{detail.data.deletions}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{t("commit.parents")}:</span>
                  {detail.data.parents.length === 0 ? (
                    <span>{t("commit.noParents")}</span>
                  ) : (
                    detail.data.parents.map((p) => (
                      <Link
                        key={p}
                        to={`/commits/${p}`}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono hover:bg-accent"
                      >
                        {p.slice(0, 7)}
                      </Link>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        {detail.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : detail.isError ? (
          <Card>
            <CardContent>
              <p className="text-sm text-destructive">
                {t("common.error")}: {String(detail.error)}
              </p>
            </CardContent>
          </Card>
        ) : detail.data ? (
          detail.data.files.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t("commit.noFileChanges")}
                </p>
              </CardContent>
            </Card>
          ) : (
            <DiffView files={detail.data.files} />
          )
        ) : null}
      </div>
    </>
  );
}
