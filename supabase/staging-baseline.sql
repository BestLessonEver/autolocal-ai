-- AutoLocal FRESH ISOLATED STAGING ONLY. Never apply to the production project.
-- Installs structure, not customer records, auth accounts, tokens, or uploaded files.
-- Read docs/STAGING-DATABASE.md. Apply this file, then the four listed migrations.
-- Reapplication is allowed only after this exact staging baseline marked the database.
BEGIN;
SET LOCAL search_path = public, pg_catalog;

DO $$ BEGIN
  IF to_regclass('auth.users') IS NULL OR to_regprocedure('auth.uid()') IS NULL OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') OR
     NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
    RAISE EXCEPTION 'Supabase-managed auth and API roles must exist before staging setup';
  END IF;
  IF to_regclass('autolocal_staging.installation') IS NULL THEN
    IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
              WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f')) OR
       EXISTS(SELECT 1 FROM auth.users) THEN
      RAISE EXCEPTION 'Staging baseline requires a fresh empty project; existing database was not modified';
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM autolocal_staging.installation
                  WHERE singleton=true AND baseline_version='20260910-fresh-staging-v1') THEN
      RAISE EXCEPTION 'Unrecognized staging baseline marker; inspect this project before continuing';
    END IF;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS autolocal_staging;
REVOKE ALL ON SCHEMA autolocal_staging FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE IF NOT EXISTS autolocal_staging.installation (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  baseline_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE autolocal_staging.installation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON autolocal_staging.installation FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO autolocal_staging.installation(singleton,baseline_version)
VALUES(true,'20260910-fresh-staging-v1') ON CONFLICT(singleton) DO NOTHING;

-- AutoLocal.ai — Required Supabase Tables
-- Legacy runtime foundation; the four release migrations extend these tables.

-- Audit requests (from website form)
CREATE TABLE IF NOT EXISTS audit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  website text,
  city text NOT NULL,
  state text NOT NULL,
  email text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Completed audits
CREATE TABLE IF NOT EXISTS audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  city text,
  state text,
  category text,
  website_url text,
  google_place_id text,
  overall_score integer,
  data jsonb,
  email_sent boolean DEFAULT false,
  email_sent_at timestamptz,
  report_viewed boolean DEFAULT false,
  report_viewed_at timestamptz,
  converted boolean DEFAULT false,
  package_purchased text,
  created_at timestamptz DEFAULT now()
);

-- Outbound emails tracking
CREATE TABLE IF NOT EXISTS outbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id uuid REFERENCES audits(id),
  to_email text NOT NULL,
  from_email text,
  subject text NOT NULL,
  template_used text,
  approach text,
  resend_id text,
  status text DEFAULT 'sent',
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  follow_up_number integer DEFAULT 0,
  next_follow_up_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Client onboarding data
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  owner_name text,
  email text,
  phone text,
  website text,
  city text,
  state text,
  package text,
  social_accounts jsonb,
  brand_preferences jsonb,
  status text DEFAULT 'onboarding',
  audit_id uuid REFERENCES audits(id),
  stripe_customer_id text,
  created_at timestamptz DEFAULT now()
);

-- AutoLocal.ai Website Previews
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS website_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  business_name text NOT NULL,
  tagline text,
  description text,
  category text NOT NULL DEFAULT 'general'
    CHECK (category IN ('salon','dental','fitness','restaurant','contractor','general')),

  -- Brand colors
  brand_color_primary text DEFAULT '#2563EB',
  brand_color_secondary text DEFAULT '#1E40AF',
  brand_color_accent text DEFAULT '#F59E0B',

  -- Media
  logo_url text,
  hero_image_url text,
  gallery_images jsonb DEFAULT '[]'::jsonb,

  -- Business data
  services jsonb DEFAULT '[]'::jsonb,
  hours jsonb DEFAULT '{}'::jsonb,
  address text,
  city text,
  state text,
  phone text,
  email text,
  website_current text,

  -- Reviews
  reviews jsonb DEFAULT '[]'::jsonb,
  google_rating numeric(2,1),
  google_review_count integer DEFAULT 0,

  -- CTA
  cta_text text DEFAULT 'Contact Us',
  cta_url text,

  -- Template & linking
  template text DEFAULT 'summit',
  audit_id uuid REFERENCES audits(id) ON DELETE SET NULL,

  -- Status & tracking
  status text DEFAULT 'draft' CHECK (status IN ('draft','published')),
  view_count integer DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_previews_slug ON website_previews(slug);
CREATE INDEX IF NOT EXISTS idx_previews_status ON website_previews(status);
CREATE INDEX IF NOT EXISTS idx_previews_audit ON website_previews(audit_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_preview_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.website_previews'::regclass AND tgname='previews_updated_at') THEN
    CREATE TRIGGER previews_updated_at BEFORE UPDATE ON public.website_previews
      FOR EACH ROW EXECUTE FUNCTION public.update_preview_timestamp();
  END IF;
END $$;

-- RPC for atomic view count increment
CREATE OR REPLACE FUNCTION increment_preview_views(preview_slug text)
RETURNS void AS $$
BEGIN
  UPDATE website_previews SET view_count = view_count + 1 WHERE slug = preview_slug;
END;
$$ LANGUAGE plpgsql;
-- AutoLocal Platform v2 Schema

-- Businesses table
create table if not exists businesses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  industry text,
  address text,
  phone text,
  website_url text,
  logo_url text,
  brand_colors jsonb default '[]'::jsonb,
  style_preset text default 'warm_personal',
  brand_description text,
  services text[],
  differentiator text,
  target_customer text,
  posting_frequency int default 5,
  preferred_days text[] default '{Mon,Tue,Wed,Thu,Fri}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Brand profiles (extended brand info)
create table if not exists brand_profiles (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  voice_description text,
  emoji_usage text default 'moderate',
  caption_style text default 'mixed',
  hashtag_count int default 5,
  learned_preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Posts table
create table if not exists posts (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  caption text not null,
  image_url text,
  scheduled_at timestamptz,
  published_at timestamptz,
  status text default 'pending' check (status in ('pending','approved','published','rejected')),
  content_type text default 'promotional',
  platforms text[] default '{facebook,instagram}',
  rating int,
  rating_feedback text,
  photo_upload boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Social connections
create table if not exists social_connections (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  platform text not null,
  connected boolean default false,
  access_token text,
  refresh_token text,
  platform_user_id text,
  connected_at timestamptz,
  created_at timestamptz default now()
);

-- Subscriptions
create table if not exists subscriptions (
  id uuid default gen_random_uuid() primary key,
  business_id uuid references businesses(id) on delete cascade not null,
  plan text default 'trial' check (plan in ('trial','starter','growth','pro')),
  status text default 'active' check (status in ('active','cancelled','expired')),
  trial_ends_at timestamptz default (now() + interval '7 days'),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz default now()
);


-- Fields added in application code after the original schema snapshots.
ALTER TABLE public.website_previews
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS hero_crop integer DEFAULT 50 CHECK (hero_crop BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS site_mode text DEFAULT 'business' CHECK (site_mode IN ('business','individual')),
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'starter',
  ADD COLUMN IF NOT EXISTS hosting_status text DEFAULT 'preview' CHECK (hosting_status IN ('preview','active','expired')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS trial_end timestamptz,
  ADD COLUMN IF NOT EXISTS custom_domain text,
  ADD COLUMN IF NOT EXISTS deploy_status text,
  ADD COLUMN IF NOT EXISTS domain_status text,
  ADD COLUMN IF NOT EXISTS domain_provider text,
  ADD COLUMN IF NOT EXISTS domain_registrar_id text,
  ADD COLUMN IF NOT EXISTS domain_auto_renew boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS domain_expires_at timestamptz;
ALTER TABLE public.audit_requests ALTER COLUMN city SET DEFAULT '', ALTER COLUMN state SET DEFAULT '';
ALTER TABLE public.outbound_emails
  ADD COLUMN IF NOT EXISTS business_name text, ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS approach_type text, ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS report_viewed_at timestamptz, ADD COLUMN IF NOT EXISTS converted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_day integer, ADD COLUMN IF NOT EXISTS parent_email_id uuid REFERENCES public.outbound_emails(id),
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz, ADD COLUMN IF NOT EXISTS error_message text;

CREATE TABLE IF NOT EXISTS public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id uuid REFERENCES public.website_previews(id) ON DELETE CASCADE,
  preview_slug text, business_name text, type text DEFAULT 'general',
  message text NOT NULL, priority text DEFAULT 'normal', cost numeric DEFAULT 0,
  status text DEFAULT 'pending', created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text DEFAULT 'feedback',
  message text NOT NULL, slug text, email text, status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
  unsubscribed_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.drip_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id uuid REFERENCES public.website_previews(id) ON DELETE CASCADE,
  email text NOT NULL, stage text NOT NULL, step integer NOT NULL,
  slug text, business_name text, contact_name text,
  status text DEFAULT 'active', send_at timestamptz NOT NULL,
  sent_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.site_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL, name text NOT NULL,
  email text, phone text, message text, instrument text, created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.research_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  business_name text, data jsonb, status text, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS previews_owner_email ON public.website_previews(email);
CREATE INDEX IF NOT EXISTS changes_preview_created ON public.change_requests(preview_id, created_at);
CREATE INDEX IF NOT EXISTS drip_due ON public.drip_queue(send_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS leads_site_created ON public.site_leads(slug, created_at);

-- Both generations of change-request routes stay in sync.
CREATE OR REPLACE FUNCTION public.resolve_change_preview() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.preview_id IS NULL AND NEW.preview_slug IS NOT NULL THEN
    SELECT id INTO NEW.preview_id FROM public.website_previews WHERE slug = NEW.preview_slug;
  ELSIF NEW.preview_id IS NOT NULL THEN
    SELECT slug INTO NEW.preview_slug FROM public.website_previews WHERE id = NEW.preview_id;
  END IF;
  RETURN NEW;
END;
$$;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.change_requests'::regclass AND tgname='change_preview') THEN
    CREATE TRIGGER change_preview BEFORE INSERT OR UPDATE OF preview_id, preview_slug
      ON public.change_requests FOR EACH ROW EXECUTE FUNCTION public.resolve_change_preview();
  END IF;
END $$;

-- The same privacy posture applies before and after the additive migrations.
-- No browser table grant exposes website drafts, leads, provider tokens or billing writes.
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'audit_requests','audits','outbound_emails','clients','website_previews',
    'change_requests','feedback','unsubscribes','drip_queue','site_leads',
    'businesses','brand_profiles','posts','social_connections','subscriptions','research_results'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',table_name);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',table_name);
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=table_name AND policyname='staging_service_access') THEN
      EXECUTE format('CREATE POLICY staging_service_access ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',table_name);
    END IF;
  END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.businesses,public.brand_profiles,public.posts TO authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
DO $$ DECLARE table_name text; BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='businesses' AND policyname='staging_owner_access') THEN
    CREATE POLICY staging_owner_access ON public.businesses FOR ALL TO authenticated
      USING(auth.uid()=user_id) WITH CHECK(auth.uid()=user_id);
  END IF;
  FOREACH table_name IN ARRAY ARRAY['brand_profiles','posts'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=table_name AND policyname='staging_owner_access') THEN
      EXECUTE format('CREATE POLICY staging_owner_access ON public.%I FOR ALL TO authenticated USING(business_id IN (SELECT id FROM public.businesses WHERE user_id=auth.uid())) WITH CHECK(business_id IN (SELECT id FROM public.businesses WHERE user_id=auth.uid()))',table_name);
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='subscriptions' AND policyname='staging_owner_read') THEN
    CREATE POLICY staging_owner_read ON public.subscriptions FOR SELECT TO authenticated
      USING(business_id IN (SELECT id FROM public.businesses WHERE user_id=auth.uid()));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.increment_preview_views(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.increment_preview_views(text) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_change_preview() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_preview_timestamp() FROM PUBLIC,anon,authenticated;
ALTER FUNCTION public.increment_preview_views(text) SET search_path=public;
ALTER FUNCTION public.update_preview_timestamp() SET search_path=public;

COMMIT;
