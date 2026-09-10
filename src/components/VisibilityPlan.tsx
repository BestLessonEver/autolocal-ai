"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import type { VisibilityTask } from "@/lib/visibility-insights";
import type { Site } from "./workspace-types";
import s from "./Workspace.module.css";

type Task = Omit<VisibilityTask, "rank" | "context" | "evidenceExpiresAt">;
type Plan = {
  generatedAt: string;
  nextRefreshAt: string | null;
  lastProcessedAt: string | null;
  tasks: Task[];
  history: Task[];
  sources: Record<
    string,
    { state: string; label: string; observedAt: string | null }
  >;
};
function examplePlan(site: Site): Plan {
  const now = new Date().toISOString();
  const tasks: Task[] = [];
  if (!site.hero_image_url && !site.gallery_images.length)
    tasks.push({
      key: "website.photo",
      title: "Show your business with a real photograph",
      description:
        "Give customers a look at your work, space, or team. Add a photograph you have permission to use.",
      priority: "medium",
      evidence: ["This example draft has no cover or gallery photograph."],
      source: {
        kind: "website",
        label: "Example website draft",
        observedAt: now,
      },
      action: {
        label: "Open website editor",
        target: "website",
        field: "hero_image_url",
      },
      revision: "demo-photo",
      inference: false,
      status: "open",
      completion: null,
      updatedAt: now,
    });
  tasks.push({
    key: "gbp.connection",
    title: "Connect your Google Business Profile",
    description:
      "In your own workspace, connect the profile you manage to compare its facts and see reported activity.",
    priority: "medium",
    evidence: ["This example has no connected Google account."],
    source: { kind: "gbp", label: "Example connection state", observedAt: now },
    action: { label: "Explore Google connections", target: "google" },
    revision: "demo-google",
    inference: false,
    status: "open",
    completion: null,
    updatedAt: now,
  });
  return {
    generatedAt: now,
    nextRefreshAt: null,
    lastProcessedAt: null,
    tasks,
    history: [],
    sources: {},
  };
}
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

export default function VisibilityPlan({
  site,
  demo,
  onAction,
}: {
  site: Site;
  demo: boolean;
  onAction: (action: Task["action"]) => void;
}) {
  const [plan, setPlan] = useState<Plan | null>(() =>
    demo ? examplePlan(site) : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completing, setCompleting] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        setPlan(examplePlan(site));
        return;
      }
      const response = await fetch(`/api/visibility/plan?siteId=${site.id}`);
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error || "Your recommendations could not load.");
      setPlan(body);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your recommendations could not load.",
      );
    } finally {
      setBusy(false);
    }
  }, [demo, site]);
  useEffect(() => {
    if (demo) return;
    const frame = requestAnimationFrame(() => {
      void load();
    });
    return () => cancelAnimationFrame(frame);
  }, [demo, load]);
  async function status(task: Task, next: "open" | "dismissed" | "completed") {
    setBusy(true);
    setError("");
    try {
      if (demo) {
        const updated = {
          ...task,
          status: next,
          completion:
            next === "completed"
              ? {
                  method: "owner_reported" as const,
                  at: new Date().toISOString(),
                  note: outcome,
                }
              : null,
        };
        setPlan(
          (current) =>
            current && {
              ...current,
              tasks: [
                ...current.tasks.filter((x) => x.key !== task.key),
                ...(next === "open" ? [updated] : []),
              ],
              history: [
                ...current.history.filter((x) => x.key !== task.key),
                ...(next !== "open" ? [updated] : []),
              ],
            },
        );
      } else {
        const response = await fetch("/api/visibility/plan", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteId: site.id,
            taskKey: task.key,
            expectedRevision: task.revision,
            status: next,
            outcome,
          }),
        });
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error || "This task could not be updated.");
        await load();
      }
      setCompleting(null);
      setOutcome("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "This task could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.section} aria-labelledby="visibility-plan-title">
      <div className={s.sectionHeader}>
        <h2 id="visibility-plan-title">Your next useful moves</h2>
        <button className={s.secondary} onClick={load} disabled={busy}>
          <RefreshCw size={14} />
          {busy ? "Checking…" : "Refresh plan"}
        </button>
      </div>
      <p className={`${s.small} ${s.spaced}`}>
        {demo
          ? "Explore recommendations based on this fictional draft. No Google account is connected."
          : "Up to five priorities, based on your saved business details, inquiry status, and available Google evidence."}
      </p>
      {error && (
        <p className={`${s.message} ${s.error}`} role="alert">
          {error}
        </p>
      )}
      {!plan && !error && <p role="status">Loading your next steps…</p>}
      {plan && (
        <>
          {plan.tasks.map((task) => (
            <article className={s.planTask} key={task.key}>
              <div className={s.sectionHeader}>
                <h3>{task.title}</h3>
                <span className={s.pill}>
                  {task.priority === "high" ? "Start here" : "Next step"}
                </span>
              </div>
              <p>{task.description}</p>
              <details className={s.planEvidence}>
                <summary>Why this is suggested</summary>
                <ul>
                  {task.evidence.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
                <p className={s.small}>
                  {task.source.label}
                  {task.source.observedAt
                    ? ` · Checked ${date(task.source.observedAt)}`
                    : " · Date unavailable"}
                  {task.inference
                    ? " · Suggested from this evidence; review it for your business."
                    : ""}
                </p>
              </details>
              <div className={s.inline}>
                {task.action.target === "google" &&
                ["phoneNumbers", "websiteUri"].includes(
                  task.action.field || "",
                ) ? (
                  <a
                    href="https://business.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={s.button}
                  >
                    Review in Google <ArrowRight size={14} />
                  </a>
                ) : (
                  <button
                    className={s.button}
                    onClick={() => onAction(task.action)}
                  >
                    {task.action.label}
                    <ArrowRight size={14} />
                  </button>
                )}
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => {
                    setCompleting(task.key);
                    setOutcome("");
                  }}
                >
                  I took care of this
                </button>
                <button
                  className={s.mutedLink}
                  disabled={busy}
                  onClick={() => status(task, "dismissed")}
                >
                  Dismiss
                </button>
              </div>
              {completing === task.key && (
                <form
                  className={s.spaced}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void status(task, "completed");
                  }}
                >
                  <label className={s.label}>
                    What did you do?
                    <textarea
                      autoFocus
                      required
                      minLength={5}
                      maxLength={1000}
                      className={s.textarea}
                      value={outcome}
                      onChange={(event) => setOutcome(event.target.value)}
                    />
                  </label>
                  <p className={s.small}>
                    This will be recorded as your report of the action. It does
                    not confirm a ranking change or a new lead.
                  </p>
                  <div className={s.inline}>
                    <button
                      className={s.button}
                      disabled={busy || outcome.trim().length < 5}
                    >
                      Save my update
                    </button>
                    <button
                      type="button"
                      className={s.secondary}
                      onClick={() => setCompleting(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </article>
          ))}
          {!plan.tasks.length && (
            <p className={s.message}>
              No open priorities were found in the available evidence. This does
              not mean your business has reached every customer. Keep your
              details current and track inquiries as they arrive.
            </p>
          )}
          {Object.values(plan.sources).some((source) =>
            ["unavailable", "stale"].includes(source.state),
          ) && (
            <p className={s.message}>
              Some sources are unavailable or out of date. Refresh the affected
              Google connection before relying on those comparisons.
            </p>
          )}
          {plan.history.length > 0 && (
            <details className={s.spaced}>
              <summary>
                Recent updates & dismissed tasks ({plan.history.length})
              </summary>
              {plan.history.map((task) => (
                <div className={s.planTask} key={task.key}>
                  <h3>{task.title}</h3>
                  <p className={s.small}>
                    {task.status === "dismissed"
                      ? "Dismissed"
                      : task.completion?.method === "verified_change"
                        ? "Relevant saved fields changed"
                        : "Completed — reported by you"}
                    {task.completion?.note ? ` · ${task.completion.note}` : ""}
                  </p>
                  {task.completion?.method !== "verified_change" && (
                    <button
                      className={s.secondary}
                      disabled={busy}
                      onClick={() => status(task, "open")}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              ))}
            </details>
          )}
          <p className={`${s.small} ${s.spaced}`}>
            Plan checked {date(plan.generatedAt)}.
            {!demo && plan.lastProcessedAt
              ? ` Last background check: ${date(plan.lastProcessedAt)}.`
              : ""}
            {!demo && plan.nextRefreshAt
              ? ` Next check due: ${date(plan.nextRefreshAt)}.`
              : ""}{" "}
            Website edits remain drafts until you publish them.
          </p>
        </>
      )}
    </section>
  );
}
