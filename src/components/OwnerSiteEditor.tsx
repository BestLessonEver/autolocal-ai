"use client";
import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { Site } from "./workspace-types";
import {
  validBusinessPhone,
  parseBusinessHours,
} from "@/lib/onboarding-validation";
import s from "./Workspace.module.css";
import { SITE_TEMPLATES, isSiteTemplate } from "./templates/types";

function editableFields(site: Site, hours: Record<string, string>, areas: string[]): Partial<Site> {
  const optional = (value: string | null | undefined) => value?.trim() || null;
  return {
    business_name: site.business_name.trim(),
    tagline: optional(site.tagline),
    description: optional(site.description),
    phone: optional(site.phone),
    contact_email: optional(site.contact_email),
    address: optional(site.address),
    city: optional(site.city),
    state: optional(site.state),
    show_address: site.show_address,
    ...(isSiteTemplate(site.template) ? { template: site.template } : {}),
    services: site.services.map(service => ({
      name: service.name.trim(),
      description: service.description?.trim() || "",
      price: service.price?.trim() || "",
    })),
    service_areas: areas.map(area => area.trim()).filter(Boolean),
    faq: site.faq.map(item => ({ question: item.question.trim(), answer: item.answer.trim() })),
    hours: Object.fromEntries(Object.entries(hours).map(([day, time]) => [day, time.trim()])),
  };
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]));
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
  }
  return false;
}

function changedFields(fields: Partial<Site>, baseline: Partial<Site>): Partial<Site> {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => !sameValue(value, baseline[key as keyof Site]))) as Partial<Site>;
}

export default function OwnerSiteEditor({
  site,
  onSave,
  onPhoto,
  onPhotoAction,
  demo = false,
}: {
  site: Site;
  onSave: (fields: Partial<Site>) => Promise<void>;
  onPhoto: (file: File, target: string) => Promise<void>;
  onPhotoAction: (action: "remove" | "set_hero", url: string) => Promise<void>;
  demo?: boolean;
}) {
  const [hoursText, setHoursText] = useState(
    Object.entries(site.hours || {})
      .map(([day, time]) => `${day}: ${time}`)
      .join("\n"),
  );
  const [areasText, setAreasText] = useState(site.service_areas.join(", "));
  const [draft, setDraft] = useState(site);
  const [baseline, setBaseline] = useState(() => editableFields(site, site.hours || {}, site.service_areas));
  const imported = site.business_facts.useGoogleListing === true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const update = <K extends keyof Site>(key: K, value: Site[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setNotice("");
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      const fields = editableFields(draft, parseBusinessHours(hoursText), areasText.split(","));
      const changed = changedFields(fields, baseline);
      const checkPhone = !imported || (Object.hasOwn(changed, "phone") && Boolean(fields.phone));
      if (checkPhone && !validBusinessPhone(fields.phone || "")) {
        setError("Enter a valid business phone number with 7 to 15 digits.");
        return;
      }
      if (!Object.keys(changed).length) {
        setNotice("There are no changes to save.");
        return;
      }
      setBusy(true);
      // Fresh Google content is display-only. Saving another field must not
      // silently convert that content into a permanent owner override.
      await onSave(imported ? changed : fields);
      setBaseline(fields);
      setNotice(
        demo
          ? "Example changes saved for this session."
          : site.setup_health.public_site
            ? "Your draft is saved. Review and publish it when ready."
            : "Your preview is saved. Review it before launch.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your changes could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function photo(e: React.ChangeEvent<HTMLInputElement>, target: string) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      await onPhoto(file, target);
      setNotice(
        demo
          ? "Photo uploads are available in your own workspace."
          : "Your photo is saved to your website draft.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Your photo could not be saved.",
      );
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }
  async function changePhoto(action: "remove" | "set_hero", url: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onPhotoAction(action, url);
      setNotice("Your photograph selection is saved to the draft.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Your photographs could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={s.form} onSubmit={save}>
      <section className={s.editSection}>
        <h2>Your identity</h2>
        <div className={s.formRow}>
          <label className={s.label}>
            Business name
            <input
              required
              className={s.input}
              maxLength={200}
              value={draft.business_name}
              onChange={(e) => update("business_name", e.target.value)}
            />
          </label>
          <label className={s.label}>
            Website design
            <select
              className={s.select}
              value={draft.template}
              onChange={(e) => update("template", e.target.value)}
            >
              {!isSiteTemplate(draft.template) && (
                <option value={draft.template}>Current legacy design</option>
              )}
              {SITE_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name} · {template.audience}</option>)}
            </select>
          </label>
        </div>
        <label className={s.label}>
          Headline
          <input
            className={s.input}
            maxLength={250}
            value={draft.tagline || ""}
            onChange={(e) => update("tagline", e.target.value)}
          />
        </label>
        <label className={s.label}>
          About your business
          <textarea
            required={!imported}
            className={s.textarea}
            maxLength={4000}
            minLength={imported ? undefined : 30}
            id="editor-description"
            value={draft.description || ""}
            onChange={(e) => update("description", e.target.value)}
          />
        </label>
      </section>
      <section className={s.editSection}>
        <h2>Contact & service area</h2>
        <div className={s.formRow}>
          <label className={s.label}>
            Business phone
            <input
              required={!imported}
              type="tel"
              minLength={7}
              maxLength={30}
              className={s.input}
              value={draft.phone || ""}
              onChange={(e) => update("phone", e.target.value)}
            />
          </label>
          <label className={s.label}>
            Public contact email
            <input
              required={!imported}
              type="email"
              className={s.input}
              id="editor-contact_email"
              value={draft.contact_email || ""}
              onChange={(e) => update("contact_email", e.target.value)}
            />
          </label>
        </div>
        <div className={s.formRow}>
          <label className={s.label}>
            City
            <input
              className={s.input}
              required={!imported}
              value={draft.city || ""}
              onChange={(e) => update("city", e.target.value)}
            />
          </label>
          <label className={s.label}>
            State or region
            <input
              className={s.input}
              required={!imported}
              value={draft.state || ""}
              onChange={(e) => update("state", e.target.value)}
            />
          </label>
        </div>
        <label className={s.label}>
          Service areas, separated by commas
          <input
            className={s.input}
            id="editor-service_areas"
            value={areasText}
            onChange={(e) => {
              setAreasText(e.target.value);
              setNotice("");
            }}
          />
        </label>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={draft.show_address}
            onChange={(e) => update("show_address", e.target.checked)}
          />
          Customers can visit this business address. Show it on the website.
        </label>
        {draft.show_address && (
          <label className={s.label}>
            Business address
            <input
              required={!imported}
              className={s.input}
              value={draft.address || ""}
              onChange={(e) => update("address", e.target.value)}
            />
          </label>
        )}
        <label className={s.label}>
          Business hours — one day per line
          <textarea
            className={s.textarea}
            value={hoursText}
            onChange={(e) => {
              setHoursText(e.target.value);
              setNotice("");
            }}
            placeholder="Monday: 9:00 AM – 5:00 PM"
          />
        </label>
      </section>
      <section id="editor-services" tabIndex={-1} className={s.editSection}>
        <h2>Services worth finding</h2>
        {draft.services.map((service, i) => (
          <div className={s.serviceRow} key={i}>
            <div className={s.formRow}>
              <label className={s.label}>
                Service name
                <input
                  required
                  className={s.input}
                  value={service.name}
                  onChange={(e) =>
                    update(
                      "services",
                      draft.services.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label className={s.label}>
                Price or pricing note
                <input
                  className={s.input}
                  value={service.price || ""}
                  onChange={(e) =>
                    update(
                      "services",
                      draft.services.map((x, j) =>
                        j === i ? { ...x, price: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
            </div>
            <label className={s.label}>
              What’s included?
              <textarea
                required={!imported}
                className={s.textarea}
                value={service.description || ""}
                maxLength={1500}
                onChange={(e) =>
                  update(
                    "services",
                    draft.services.map((x, j) =>
                      j === i ? { ...x, description: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            {draft.services.length > (imported ? 0 : 1) && (
              <button
                type="button"
                className={s.secondary}
                onClick={() =>
                  update(
                    "services",
                    draft.services.filter((_, j) => j !== i),
                  )
                }
              >
                <Trash2 size={14} />
                Remove service
              </button>
            )}
          </div>
        ))}
        {draft.services.length < 12 && (
          <button
            type="button"
            className={s.secondary}
            onClick={() =>
              update("services", [
                ...draft.services,
                { name: "", description: "" },
              ])
            }
          >
            <Plus size={15} />
            Add a service
          </button>
        )}
      </section>
      <section id="editor-faq" tabIndex={-1} className={s.editSection}>
        <h2>Useful answers</h2>
        <p className={s.small}>
          Answer the questions customers actually ask. Publish only facts you
          have confirmed.
        </p>
        {draft.faq.map((item, i) => (
          <div className={s.serviceRow} key={i}>
            <label className={s.label}>
              Question
              <input
                required
                className={s.input}
                value={item.question}
                maxLength={300}
                onChange={(e) =>
                  update(
                    "faq",
                    draft.faq.map((x, j) =>
                      j === i ? { ...x, question: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label className={s.label}>
              Answer
              <textarea
                required
                className={s.textarea}
                value={item.answer}
                maxLength={2000}
                onChange={(e) =>
                  update(
                    "faq",
                    draft.faq.map((x, j) =>
                      j === i ? { ...x, answer: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className={s.secondary}
              onClick={() =>
                update(
                  "faq",
                  draft.faq.filter((_, j) => j !== i),
                )
              }
            >
              Remove question
            </button>
          </div>
        ))}
        <button
          type="button"
          className={s.secondary}
          onClick={() =>
            update("faq", [...draft.faq, { question: "", answer: "" }])
          }
        >
          <Plus size={15} />
          Add a question
        </button>
      </section>
      <section
        id="editor-hero_image_url"
        tabIndex={-1}
        className={s.editSection}
      >
        <h2>Your real photographs</h2>
        <p className={s.small}>
          Show your work, your space, and your team. Upload JPG, PNG, or WebP
          images you have permission to use, up to 5 MB each.
        </p>
        <div className={s.formRow}>
          <label className={s.label}>
            <span className={s.inline}>
              <Upload size={15} />
              Cover photo
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || demo}
              onChange={(e) => photo(e, "hero")}
            />
          </label>
          <label className={s.label}>
            <span className={s.inline}>
              <Upload size={15} />
              Gallery photograph
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy || demo}
              onChange={(e) => photo(e, "gallery")}
            />
          </label>
        </div>
        {site.hero_image_url && (
          <div className={s.photoGrid}>
            <div>
              <img
                src={site.hero_image_url}
                alt="Your current cover photograph"
              />
              <button
                type="button"
                className={s.secondary}
                disabled={busy}
                onClick={() => changePhoto("remove", site.hero_image_url!)}
              >
                Remove cover
              </button>
            </div>
          </div>
        )}
        {site.gallery_images.length > 0 && (
          <div className={s.photoGrid}>
            {site.gallery_images.map((url, i) => (
              <div key={url}>
                <img src={url} alt={`Business photograph ${i + 1}`} />
                <div className={s.photoActions}>
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={busy || site.hero_image_url === url}
                    onClick={() => changePhoto("set_hero", url)}
                  >
                    Use as cover
                  </button>
                  <button
                    type="button"
                    className={s.secondary}
                    disabled={busy}
                    onClick={() => changePhoto("remove", url)}
                    aria-label={`Remove photograph ${i + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className={`${s.message} ${s.error}`}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={s.message}>
          {notice}
        </p>
      )}
      <div className={s.saveBar}>
        <p className={s.small}>
          Save your draft, then review it.
          <br />
          Publishing is a separate step.
        </p>
        <button className={s.button} disabled={busy}>
          {busy ? "Saving…" : "Save website draft"}
        </button>
      </div>
    </form>
  );
}
