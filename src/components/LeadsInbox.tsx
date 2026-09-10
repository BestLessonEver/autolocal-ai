"use client";
import { useEffect, useRef, useState } from "react";
import { Mail, MessageCircle, Phone, X } from "lucide-react";
import { type Lead, statuses } from "./workspace-types";
import s from "./Workspace.module.css";
export default function LeadsInbox({
  leads,
  total,
  onUpdate,
  initialLead,
  onClose,
  demo = false,
}: {
  leads: Lead[];
  total: number;
  initialLead?: Lead | null;
  onClose?: () => void;
  onUpdate: (
    id: string,
    updates: {
      status?: string;
      notes?: string;
    },
  ) => Promise<void>;
  demo?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<string | null>(
    initialLead?.id || null,
  );
  const detail = useRef<HTMLElement>(null);
  const [notes, setNotes] = useState(initialLead?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lead =
      leads.find((x) => x.id === selected) ||
      (initialLead?.id === selected ? initialLead : undefined),
    visible = leads.filter(
      (x) =>
        (filter === "all" || x.status === filter) &&
        `${x.name} ${x.email} ${x.service} ${x.message}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  useEffect(() => {
    if (selected) {
      const frame = requestAnimationFrame(() => {
        detail.current?.scrollIntoView({ block: "center", behavior: "smooth" });
        detail.current?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [selected]);
  async function update(updates: { status?: string; notes?: string }) {
    if (!lead) return;
    setBusy(true);
    setError("");
    try {
      await onUpdate(lead.id, updates);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={s.filters}>
        <label className="sr-only" htmlFor="inquiry-search">
          Search inquiries
        </label>
        <input
          id="inquiry-search"
          className={s.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, service, or message"
        />
        <label className="sr-only" htmlFor="inquiry-status">
          Filter inquiry status
        </label>
        <select
          id="inquiry-status"
          className={s.select}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {statuses.map((x) => (
            <option key={x} value={x}>
              {x.charAt(0).toUpperCase() + x.slice(1)}
            </option>
          ))}
        </select>
      </div>
      {leads.length === 0 ? (
        <div className={s.empty}>
          <MessageCircle size={32} />
          <h2>Make room for your next customer.</h2>
          <p>
            Inquiries from your published website will appear here. You’ll be
            able to follow up, add notes, and track which conversations become
            booked work.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className={s.empty}>
          <h2>No matching inquiries.</h2>
          <p>Try a different search or status.</p>
          <button
            className={s.secondary}
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">Customer</th>
                  <th scope="col">Interested in</th>
                  <th scope="col">Status</th>
                  <th scope="col">Received</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <button
                        className={s.leadButton}
                        onClick={() => {
                          setSelected(x.id);
                          setNotes(x.notes || "");
                          setError("");
                        }}
                      >
                        {x.name}
                      </button>
                      <small>{x.email || x.phone}</small>
                    </td>
                    <td>
                      {x.service || "General inquiry"}
                      <small>
                        {x.attribution?.utm_source || x.source || "Website"}
                      </small>
                    </td>
                    <td>
                      <span className={s.pill}>{x.status}</span>
                    </td>
                    <td>
                      {new Date(x.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.tableSummary}>
            {visible.length} shown · {total} saved inquiries
            {total > leads.length
              ? " · Search and filters apply to the most recent 200."
              : ""}
          </p>
        </>
      )}
      {lead && (
        <section
          ref={detail}
          tabIndex={-1}
          className={s.detail}
          aria-label={`Inquiry from ${lead.name}`}
        >
          <div className={s.detailHeader}>
            <h2>{lead.name}</h2>
            <button
              className={s.secondary}
              aria-label="Close inquiry"
              onClick={() => {
                setSelected(null);
                onClose?.();
              }}
            >
              <X size={16} />
            </button>
          </div>
          <p>{lead.message || "No message was included."}</p>
          <div className={s.detailActions}>
            {lead.email &&
              (demo ? (
                <span className={s.small}>Example email: {lead.email}</span>
              ) : (
                <a href={`mailto:${lead.email}`} className={s.secondary}>
                  <Mail size={16} />
                  Email customer
                </a>
              ))}
            {lead.phone && !demo && (
              <a
                href={`tel:${lead.phone.replace(/[^+0-9]/g, "")}`}
                className={s.secondary}
              >
                <Phone size={16} />
                Call customer
              </a>
            )}
          </div>
          <label className={s.label}>
            Conversation status
            <select
              className={s.select}
              disabled={busy}
              value={lead.status}
              onChange={(e) => update({ status: e.target.value })}
            >
              {statuses.map((x) => (
                <option key={x} value={x}>
                  {x.charAt(0).toUpperCase() + x.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <form
            className={`${s.noteForm} ${s.spaced}`}
            onSubmit={(e) => {
              e.preventDefault();
              update({ notes });
            }}
          >
            <label className={s.label}>
              Private follow-up notes
              <textarea
                className={s.textarea}
                value={notes}
                maxLength={5000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What did you discuss? What happens next?"
              />
            </label>
            <button className={s.button} disabled={busy}>
              {busy ? "Saving…" : "Save notes"}
            </button>
          </form>
          {error && (
            <p role="alert" className={`${s.message} ${s.error}`}>
              {error}
            </p>
          )}
        </section>
      )}
    </>
  );
}
