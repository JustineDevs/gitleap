import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";

import { trpc } from "@/utils/trpc";

export default function Submit() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [revision, setRevision] = useState("");
  const submit = useMutation(
    trpc.submitProcessing.mutationOptions({
      onSuccess: (result) => navigate(`/processing/${result.jobId}`),
    }),
  );

  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <p className="mb-3 font-mono text-muted-foreground text-xs uppercase tracking-[0.25em]">
        GitLeap / ingest
      </p>
      <h1 className="font-semibold text-4xl tracking-tight">
        Compile a repository into a skill pack.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Public GitHub only. Use an immutable 40-character commit SHA so the result stays
        reproducible.
      </p>
      <form
        className="mt-8 grid gap-4 rounded-xl border p-5"
        onSubmit={(event) => {
          event.preventDefault();
          submit.mutate({ url, revision, includeTests: true });
        }}
      >
        <label className="grid gap-2 text-sm">
          Repository URL
          <input
            className="rounded-md border bg-transparent px-3 py-2"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://github.com/owner/repository"
            required
          />
        </label>
        <label className="grid gap-2 text-sm">
          Commit SHA
          <input
            className="rounded-md border bg-transparent px-3 py-2 font-mono"
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            placeholder="40-character commit SHA"
            minLength={40}
            maxLength={40}
            required
          />
        </label>
        {submit.error ? <p className="text-red-400 text-sm">{submit.error.message}</p> : null}
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={submit.isPending}
        >
          {submit.isPending ? "Queueing..." : "Start processing"}
        </button>
      </form>
    </main>
  );
}
