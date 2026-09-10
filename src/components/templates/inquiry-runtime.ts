/** Literal, self-contained browser code shared by previews and exported sites.
 * Do not serialize a compiled function: bundlers can inject private helper references.
 */
export const INQUIRY_RUNTIME = String.raw`
(function () {
  if (window.__autoLocalInquiryInstalled) return;
  window.__autoLocalInquiryInstalled = true;
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var link = target.closest('a[data-inquiry-service]');
    if (!link) return;
    var site = link.closest('.al-site');
    var service = site && site.querySelector('form[data-al-inquiry] select[name="service"]');
    if (service) service.value = link.dataset.inquiryService || '';
  });
  document.addEventListener('submit', async function (event) {
    var form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('form[data-al-inquiry]')) return;
    event.preventDefault();
    var status = form.querySelector('[data-form-status]');
    var submit = form.querySelector('button[type="submit"]');
    if (!status || !submit) return;
    if (form.dataset.mode !== 'live') {
      status.textContent = form.dataset.mode === 'demo'
        ? 'This is a design demo. No inquiry has been sent.'
        : 'This is a private preview. Inquiries will work once your website is live.';
      return;
    }
    if (!form.reportValidity()) return;
    var fields = new FormData(form);
    var email = String(fields.get('email') || '').trim();
    var phone = String(fields.get('phone') || '').trim();
    if (!email && !phone) {
      status.textContent = 'Please add an email address or phone number so the business can reply.';
      form.querySelector('[name="email"]').focus();
      return;
    }
    if (submit.disabled) return;
    var label = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'Sending…';
    status.textContent = '';
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 20000);
    try {
      var parameters = new URLSearchParams(window.location.search);
      var body = {
        slug: form.dataset.slug || '', name: String(fields.get('name') || '').trim(), email: email, phone: phone,
        message: String(fields.get('message') || '').trim(), service: String(fields.get('service') || ''),
        website: String(fields.get('website') || ''), source: 'customer_website',
        landing_page: window.location.origin + window.location.pathname,
        referrer: document.referrer ? new URL(document.referrer).origin : ''
      };
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (key) {
        var value = parameters.get(key);
        if (value) body[key] = value.slice(0, 200);
      });
      if (!form.dataset.submissionId && window.crypto && window.crypto.randomUUID) form.dataset.submissionId = window.crypto.randomUUID();
      if (form.dataset.submissionId) body.submission_id = form.dataset.submissionId;
      var response = await fetch(form.dataset.endpoint || '/api/leads/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok || result.success !== true || !result.lead_id) {
        throw new Error(typeof result.error === 'string' ? result.error : 'Your inquiry could not be saved. Please try again or use the contact details on this page.');
      }
      form.reset();
      delete form.dataset.submissionId;
      status.textContent = 'Thank you. Your inquiry has been received. This is a request, not a confirmed appointment.';
      status.focus();
    } catch (error) {
      status.textContent = error instanceof Error && error.name !== 'AbortError'
        ? error.message : 'We could not confirm receipt. Please try again or contact the business directly.';
    } finally {
      window.clearTimeout(timer);
      submit.disabled = false;
      submit.textContent = label;
    }
  });
})();`;

export function inquiryRuntimeScript() { return INQUIRY_RUNTIME }
