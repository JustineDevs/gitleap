import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router";

import { trpc } from "@/utils/trpc";

const TERMINAL_STATES = new Set(["ready", "failed", "cancelled", "expired"]);

export function processingPollInterval(
  status: string | undefined,
  attempt: number,
  failureCount = 0,
): number | false {
  if (status && TERMINAL_STATES.has(status)) return false;
  const exponent = Math.min(4, Math.max(0, attempt, failureCount));
  return Math.min(10_000, 1_000 * 2 ** exponent);
}

export default function Processing() {
  const { jobId = "" } = useParams();
  const pollAttempt = useRef(0);
  const pollingJobId = useRef(jobId);
  const status = useQuery(
    trpc.getProcessingStatus.queryOptions(
      { jobId },
      {
        enabled: Boolean(jobId),
        refetchInterval: (query) => {
          if (pollingJobId.current !== jobId) {
            pollingJobId.current = jobId;
            pollAttempt.current = 0;
          }
          const interval = processingPollInterval(
            query.state.data?.status,
            pollAttempt.current,
            query.state.fetchFailureCount,
          );
          if (interval === false) {
            pollAttempt.current = 0;
            return false;
          }
          pollAttempt.current = Math.min(4, pollAttempt.current + 1);
          return interval;
        },
      },
    ),
  );
  const cancel = useMutation(
    trpc.cancelProcessing.mutationOptions({ onSuccess: () => void status.refetch() }),
  );
  const download = useQuery(
    trpc.getArtifactDownload.queryOptions({ jobId }, { enabled: status.data?.status === "ready" }),
  );
  const terminal = ["ready", "failed", "cancelled", "expired"].includes(status.data?.status ?? "");

  useEffect(() => {
    if (!jobId) void status.refetch();
  }, [jobId, status.refetch]);

  return (
    <main className="container mx-auto max-w-2xl px-4 py-10">
      <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.25em]">
        Processing job
      </p>
      <h1 className="mt-3 font-semibold text-3xl">
        {status.data?.status ?? (status.isLoading ? "queued" : "unavailable")}
      </h1>
      <p className="mt-2 font-mono text-muted-foreground text-xs">{jobId}</p>
      {status.error ? (
        <div className="mt-6 grid gap-2 text-red-400 text-sm">
          <p>Unable to load this processing job.</p>
          <p>{status.error.message}</p>
          <button type="button" className="w-fit underline" onClick={() => void status.refetch()}>
            Retry status
          </button>
        </div>
      ) : null}
      {!terminal && (
        <button
          type="button"
          className="mt-6 rounded-md border px-4 py-2 text-sm"
          disabled={cancel.isPending || status.data?.version === undefined}
          onClick={() =>
            status.data && cancel.mutate({ jobId, expectedVersion: status.data.version })
          }
        >
          {cancel.isPending ? "Cancelling..." : "Cancel processing"}
        </button>
      )}
      {status.data?.status === "ready" && download.data ? (
        <a
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
          href={download.data.url}
        >
          Download skill pack
        </a>
      ) : null}
      {status.data?.status === "ready" && download.isLoading ? (
        <p className="mt-6 text-emerald-400 text-sm">Preparing your private artifact link...</p>
      ) : null}
      {status.data?.status === "ready" && download.error ? (
        <div className="mt-6 grid gap-2 text-red-400 text-sm">
          <p>{download.error.message}</p>
          <button type="button" className="w-fit underline" onClick={() => void download.refetch()}>
            Retry download link
          </button>
        </div>
      ) : null}
      {cancel.error ? <p className="mt-4 text-red-400 text-sm">{cancel.error.message}</p> : null}
      {status.data?.status === "failed" && (
        <p className="mt-6 text-red-400 text-sm">
          Processing failed. Submit the same revision again to create a new attempt.
        </p>
      )}
      <Link className="mt-8 block text-sm underline" to="/submit">
        Process another repository
      </Link>
    </main>
  );
}
