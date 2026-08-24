const sha = "7fd1a60b01f91b314f59955a4e4d4e80d8edf11d";

const { fetchGithubArchive, readTarArchive } = await import(
  "../apps/server/src/processing/source-github.ts"
);
const archive = await fetchGithubArchive({
  owner: "octocat",
  repository: "Hello-World",
  commitSha: sha,
  signal: AbortSignal.timeout(30_000),
});
const files = await readTarArchive(archive.stream);
if (files.length === 0) throw new Error("GitHub archive is empty");
if (!files.some((file) => file.path.endsWith("/README")))
  throw new Error("GitHub archive is missing its README entry");
console.log(JSON.stringify({ repository: "octocat/Hello-World", sha, files: files.length }));
