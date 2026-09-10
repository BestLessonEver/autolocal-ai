-- Additive upgrade for the recovered project. Review and apply through a release;
-- never use rebuild.sql on an existing database. No existing customer is reassigned.
BEGIN;

ALTER TABLE public.website_previews
  ADD COLUMN IF NOT EXISTS requested_deployment_job_id uuid,
  ADD COLUMN IF NOT EXISTS checkout_event_id text,
  ADD COLUMN IF NOT EXISTS checkout_site_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS published_site_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS checkout_session_id text,
  ADD COLUMN IF NOT EXISTS checkout_request_key uuid,
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS cancel_date timestamptz,
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS last_optimized_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_event_created bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_status text,
  ADD COLUMN IF NOT EXISTS vercel_project_id text,
  ADD COLUMN IF NOT EXISTS vercel_deployment_id text,
  ADD COLUMN IF NOT EXISTS deployment_url text,
  ADD COLUMN IF NOT EXISTS deployment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS deploy_error text,
  ADD COLUMN IF NOT EXISTS domain_purchase_price numeric,
  ADD COLUMN IF NOT EXISTS domain_order_status text,
  ADD COLUMN IF NOT EXISTS reviews_verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS service_areas jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS image_caption text,
  ADD COLUMN IF NOT EXISTS show_address boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS business_facts jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS faq jsonb DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS website_previews_owner_id ON public.website_previews(owner_id);
CREATE INDEX IF NOT EXISTS website_previews_owner_email ON public.website_previews(lower(email)) WHERE owner_id IS NULL;
ALTER TABLE public.website_previews DROP CONSTRAINT IF EXISTS website_previews_hosting_status_check;
ALTER TABLE public.website_previews ADD CONSTRAINT website_previews_hosting_status_check
  CHECK (hosting_status IN ('preview','provisioning','active','pending_cancel','cancelled','expired','failed','past_due'));

ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS preview_id uuid REFERENCES public.website_previews(id),
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0;
UPDATE public.change_requests c SET preview_id = p.id FROM public.website_previews p WHERE c.preview_id IS NULL AND c.preview_slug = p.slug;
ALTER TABLE public.drip_queue ADD COLUMN IF NOT EXISTS preview_id uuid REFERENCES public.website_previews(id);
UPDATE public.drip_queue d SET preview_id = p.id FROM public.website_previews p WHERE d.preview_id IS NULL AND d.slug = p.slug;

CREATE TABLE IF NOT EXISTS public.site_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL, name text NOT NULL,
  email text, phone text, message text, instrument text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.site_leads
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.website_previews(id),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS submission_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE public.site_leads l SET site_id = p.id FROM public.website_previews p WHERE l.site_id IS NULL AND l.slug = p.slug;
ALTER TABLE public.site_leads DROP CONSTRAINT IF EXISTS site_leads_status_check;
ALTER TABLE public.site_leads ADD CONSTRAINT site_leads_status_check CHECK (status IN ('new','contacted','qualified','booked','won','lost','spam'));
CREATE INDEX IF NOT EXISTS site_leads_owner_inbox ON public.site_leads(site_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS site_leads_submission_dedupe ON public.site_leads(site_id,submission_id) WHERE submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lead_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES public.site_leads(id),
  site_id uuid NOT NULL REFERENCES public.website_previews(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','retry','failed')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz, sent_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lead_id)
);
CREATE TABLE IF NOT EXISTS public.contact_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,
  business_name text,message text NOT NULL,source text NOT NULL DEFAULT 'contact',
  consent boolean NOT NULL CHECK(consent),marketing_opt_in boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new',created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.submit_site_lead(p_slug text, p_name text, p_email text, p_phone text, p_message text,
  p_instrument text DEFAULT NULL, p_service text DEFAULT NULL, p_source text DEFAULT NULL,
  p_attribution jsonb DEFAULT '{}'::jsonb, p_submission_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE site public.website_previews; lead_uuid uuid;
BEGIN
  SELECT * INTO site FROM public.website_previews WHERE slug = p_slug AND hosting_status IN ('active','pending_cancel') AND status = 'published' AND deployment_verified_at IS NOT NULL AND website_current IS NOT NULL AND coalesce(deploy_status,'') <> 'suspended';
  IF site.id IS NULL THEN RAISE EXCEPTION 'Website not accepting inquiries' USING ERRCODE = 'P0002'; END IF;
  IF length(trim(coalesce(p_name,''))) < 1 OR (coalesce(p_email,'') = '' AND coalesce(p_phone,'') = '') THEN
    RAISE EXCEPTION 'Name and contact information required' USING ERRCODE = '22023';
  END IF;
  -- Same request token safely replays the acknowledgement, without a second email.
  IF p_submission_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(site.id::text || p_submission_id::text));
    SELECT id INTO lead_uuid FROM public.site_leads WHERE site_id=site.id AND submission_id=p_submission_id;
    IF lead_uuid IS NOT NULL THEN RETURN lead_uuid; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(site.id::text || lower(coalesce(nullif(p_email,''),p_phone))));
  IF (SELECT count(*) FROM public.site_leads WHERE site_id=site.id AND created_at>now()-interval '1 hour'
      AND ((p_email<>'' AND lower(email)=lower(p_email)) OR (p_phone<>'' AND phone=p_phone)))>=5 THEN
    RAISE EXCEPTION 'Too many inquiries from this contact; try again later' USING ERRCODE='P0429';
  END IF;
  INSERT INTO public.site_leads(site_id,slug,name,email,phone,message,instrument,service,source,attribution,submission_id)
    VALUES(site.id,site.slug,p_name,nullif(p_email,''),nullif(p_phone,''),p_message,p_instrument,p_service,p_source,coalesce(p_attribution,'{}'),p_submission_id)
    RETURNING id INTO lead_uuid;
  INSERT INTO public.lead_notifications(lead_id,site_id) VALUES(lead_uuid,site.id);
  RETURN lead_uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_lead_notifications(p_limit integer DEFAULT 10)
RETURNS SETOF public.lead_notifications LANGUAGE sql SET search_path=public AS $$
  UPDATE public.lead_notifications n SET status='processing',attempts=n.attempts+1,claimed_at=now()
  WHERE id IN (SELECT id FROM public.lead_notifications WHERE attempts<5 AND
    ((status IN ('pending','retry') AND next_attempt_at<=now()) OR (status='processing' AND claimed_at<now()-interval '10 minutes'))
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,50))) RETURNING n.*;
$$;

CREATE OR REPLACE FUNCTION public.unsubscribe_contact(p_email text)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF p_email IS NULL OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Valid email required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(lower(trim(p_email))));
  IF NOT EXISTS(SELECT 1 FROM public.unsubscribes WHERE lower(email)=lower(trim(p_email))) THEN
    INSERT INTO public.unsubscribes(email,unsubscribed_at) VALUES(lower(trim(p_email)),now());
  END IF;
  UPDATE public.drip_queue SET status='cancelled' WHERE lower(email)=lower(trim(p_email)) AND status IN ('active','paused');
END;
$$;

CREATE TABLE IF NOT EXISTS public.integration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL,
  site_id uuid REFERENCES public.website_previews(id), payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','succeeded','retry','failed','needs_review')),
  attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz, result jsonb, error text, idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS integration_jobs_due ON public.integration_jobs(next_attempt_at) WHERE status IN ('pending','retry');
CREATE OR REPLACE FUNCTION public.claim_integration_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.integration_jobs LANGUAGE plpgsql SET search_path=public AS $$
DECLARE candidate public.integration_jobs;claimed public.integration_jobs;claimed_sites uuid[]:=ARRAY[]::uuid[];claimed_count int:=0;
BEGIN
  -- Serialize the brief claim transaction, not provider work. A new statement
  -- snapshot after this lock observes leases committed by another claimant.
  PERFORM pg_advisory_xact_lock(hashtext('autolocal_integration_job_claim'));
  FOR candidate IN SELECT j.* FROM integration_jobs j WHERE j.attempts<5 AND
    ((j.status IN ('pending','retry') AND j.next_attempt_at<=now()) OR (j.status='processing' AND j.claimed_at<now()-interval '10 minutes')) AND
    (j.site_id IS NULL OR NOT EXISTS(SELECT 1 FROM integration_jobs active WHERE active.site_id=j.site_id AND active.id<>j.id AND active.status='processing' AND active.claimed_at>=now()-interval '10 minutes'))
    ORDER BY j.created_at FOR UPDATE SKIP LOCKED
  LOOP
    IF candidate.site_id IS NOT NULL AND candidate.site_id=ANY(claimed_sites) THEN CONTINUE; END IF;
    UPDATE integration_jobs SET status='processing',attempts=attempts+1,claimed_at=now(),updated_at=now() WHERE id=candidate.id RETURNING * INTO claimed;
    IF candidate.site_id IS NOT NULL THEN claimed_sites:=array_append(claimed_sites,candidate.site_id); END IF;
    RETURN NEXT claimed;
    claimed_count:=claimed_count+1;
    EXIT WHEN claimed_count>=greatest(1,least(p_limit,50));
  END LOOP;
END;
$$;
CREATE TABLE IF NOT EXISTS public.billing_events (
  provider_event_id text PRIMARY KEY,event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK(status IN ('processing','processed','failed')),
  attempts integer NOT NULL DEFAULT 1,claimed_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,error text
);
CREATE OR REPLACE FUNCTION public.claim_billing_event(p_event_id text,p_event_type text)
RETURNS text LANGUAGE plpgsql SET search_path=public AS $$
DECLARE event public.billing_events;
BEGIN
  INSERT INTO public.billing_events(provider_event_id,event_type) VALUES(p_event_id,p_event_type) ON CONFLICT DO NOTHING;
  IF FOUND THEN RETURN 'claimed'; END IF;
  SELECT * INTO event FROM public.billing_events WHERE provider_event_id=p_event_id FOR UPDATE;
  IF event.status='processed' THEN RETURN 'processed'; END IF;
  IF event.status='processing' AND event.claimed_at>now()-interval '10 minutes' THEN RETURN 'busy'; END IF;
  UPDATE public.billing_events SET status='processing',attempts=attempts+1,claimed_at=now(),error=NULL WHERE provider_event_id=p_event_id;
  RETURN 'claimed';
END;
$$;

CREATE TABLE IF NOT EXISTS public.research_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid REFERENCES public.businesses(id),
  business_name text,data jsonb,status text,created_at timestamptz DEFAULT now()
);

-- Keep operational data behind verified server routes. RLS is defense in depth.
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['website_previews','change_requests','site_leads','lead_notifications','contact_inquiries','integration_jobs','billing_events','research_results','audit_requests','audits','outbound_emails','clients','feedback','drip_queue','unsubscribes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',table_name);
    EXECUTE format('DROP POLICY IF EXISTS wave1_service_access ON public.%I',table_name);
    EXECUTE format('CREATE POLICY wave1_service_access ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',table_name);
  END LOOP;
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.subscriptions FROM anon,authenticated;
REVOKE ALL ON public.social_connections FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.submit_site_lead(text,text,text,text,text,text,text,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_site_lead(text,text,text,text,text,text,text,text,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_lead_notifications(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_lead_notifications(integer) TO service_role;
REVOKE ALL ON FUNCTION public.unsubscribe_contact(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.unsubscribe_contact(text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_integration_jobs(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_integration_jobs(integer) TO service_role;
REVOKE ALL ON FUNCTION public.claim_billing_event(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_billing_event(text,text) TO service_role;
REVOKE ALL ON FUNCTION public.increment_preview_views(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.increment_preview_views(text) TO service_role;
COMMIT;
