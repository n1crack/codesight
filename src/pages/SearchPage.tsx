import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";

import { api } from "@/api";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState, PageHeader } from "@/components/PageHeader";
import { useAppState } from "@/state/AppState";
import { formatDate } from "@/lib/format";
import type { CommitInfo, SearchParams } from "@/types";

export function SearchPage() {
  const { t, i18n } = useTranslation();
  const { selectedRepoId } = useAppState();

  const [query, setQuery] = useState("");
  const [author, setAuthor] = useState("");
  const [path, setPath] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");

  const search = useMutation({
    mutationFn: async () => {
      const params: SearchParams = { limit: 200 };
      if (query.trim()) params.query = query.trim();
      if (author.trim()) params.authorEmail = author.trim();
      if (path.trim()) params.path = path.trim();
      if (since) params.since = since;
      if (until) params.until = until;
      return api.searchCommits(selectedRepoId!, params);
    },
  });

  const reset = () => {
    setQuery("");
    setAuthor("");
    setPath("");
    setSince("");
    setUntil("");
    search.reset();
  };

  if (selectedRepoId == null) {
    return (
      <>
        <PageHeader title={t("search.title")} />
        <EmptyState>{t("common.selectRepo")}</EmptyState>
      </>
    );
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search.mutate();
  };

  const results = (search.data ?? []) as CommitInfo[];

  return (
    <>
      <PageHeader title={t("search.title")} subtitle={t("search.subtitle")} />
      <div className="flex flex-col gap-4 p-6">
        <Card>
          <CardContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Input
                  placeholder={t("search.messagePlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Input
                  placeholder={t("search.authorPlaceholder")}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                />
                <Input
                  placeholder={t("search.pathPlaceholder")}
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t("search.since")}
                  <Input
                    type="date"
                    value={since}
                    onChange={(e) => setSince(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  {t("search.until")}
                  <Input
                    type="date"
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </label>
                <div className="col-span-2 flex items-end justify-end gap-2 md:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reset}
                  >
                    {t("search.clear")}
                  </Button>
                  <Button type="submit" disabled={search.isPending}>
                    <Search size={14} /> {t("search.submit")}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>

        {search.isPending && (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        )}
        {search.isError && (
          <p className="text-sm text-destructive">{t("common.error")}</p>
        )}
        {search.isSuccess && (
          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-2 text-xs text-muted-foreground">
                {t("search.results", { count: results.length })}
              </div>
              {results.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {t("search.noResults")}
                </p>
              ) : (
                <ul className="divide-y">
                  {results.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start gap-3 p-3 text-sm"
                    >
                      <code className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        {c.shortId}
                      </code>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{c.summary}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Link
                            to={`/contributors/${encodeURIComponent(c.authorEmail)}`}
                            className="hover:underline"
                          >
                            {c.authorName}
                          </Link>
                          <span>·</span>
                          <span>{formatDate(c.timestamp, i18n.language)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
