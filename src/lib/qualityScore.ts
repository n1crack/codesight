import type { QualityReport } from "@/types";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export interface QualitySubScores {
  hygiene: number; // 0-20
  secrets: number; // 0-20
  dependencies: number; // 0-20
  code: number; // 0-20
  authorship: number; // 0-20
  total: number; // 0-100
}

export function scoreQuality(d: QualityReport): QualitySubScores {
  const cov = d.repoHygiene.gitignore.covers;
  const missingCovers = d.repoHygiene.gitignore.present
    ? (cov.envFiles ? 0 : 1) +
      (cov.nodeModules ? 0 : 1) +
      (cov.target ? 0 : 1) +
      (cov.distBuild ? 0 : 1) +
      (cov.ide ? 0 : 1) +
      (cov.osFiles ? 0 : 1)
    : 6;
  const missingCritical =
    (d.repoHygiene.gitignore.present ? 0 : 1) +
    (d.repoHygiene.license.present ? 0 : 1) +
    (d.repoHygiene.readme.present ? 0 : 1) +
    (d.repoHygiene.ciConfig.present ? 0 : 1);
  const missingOptional =
    (d.repoHygiene.contributing.present ? 0 : 1) +
    (d.repoHygiene.securityMd.present ? 0 : 1) +
    (d.repoHygiene.codeOfConduct.present ? 0 : 1) +
    (d.repoHygiene.editorconfig.present ? 0 : 1);
  const hygiene = clamp(
    20 - missingCritical * 3 - missingOptional * 0.5 - missingCovers * 1.2,
    0,
    20,
  );

  const highHits = d.secretsHead.hits.filter((s) => s.severity === "high")
    .length;
  const medHits = d.secretsHead.hits.filter((s) => s.severity === "medium")
    .length;
  const lowHits = d.secretsHead.hits.length - highHits - medHits;
  const secrets = clamp(
    20 -
      highHits * 12 -
      medHits * 5 -
      lowHits * 2 -
      d.secretsHead.riskyFiles.length * 3,
    0,
    20,
  );

  const noLock = d.dependencies.manifests.filter((m) => !m.lockfilePath).length;
  const dependencies = clamp(20 - noLock * 4, 0, 20);

  const code = clamp(
    20 -
      d.codeHygiene.conflictMarkers.length * 10 -
      d.codeHygiene.generatedFiles.length * 1 -
      Math.min(8, d.codeHygiene.largeFiles.length * 0.8) -
      Math.max(0, d.codeHygiene.todoCount - 50) * 0.05,
    0,
    20,
  );

  const botPenalty =
    d.authorship.botSharePct > 30
      ? Math.min(10, (d.authorship.botSharePct - 30) / 5)
      : 0;
  const authorship = clamp(
    20 - botPenalty - d.authorship.genericEmailAuthors.length * 1.5,
    0,
    20,
  );

  return {
    hygiene,
    secrets,
    dependencies,
    code,
    authorship,
    total: Math.round(hygiene + secrets + dependencies + code + authorship),
  };
}
