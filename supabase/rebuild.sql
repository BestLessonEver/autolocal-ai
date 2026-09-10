-- AutoLocal recovery baseline, 2026-09-10.
-- For a NEW EMPTY Supabase project only. Preserves original SQL as historical reference.
-- Recreates structure, not deleted records, auth users, or uploaded files.
-- Execute once in SQL Editor after reviewing docs/REVIVAL.md. Atomic transaction.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.website_previews') IS NOT NULL OR to_regclass('public.businesses') IS NOT NULL THEN
    RAISE EXCEPTION 'Recovery baseline requires an empty AutoLocal database';
  END IF;
END $$;
-- AutoLocal.ai — Required Supabase Tables
-- Run this in Supabase Dashboard → SQL Editor

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
  from_email text DEFAULT 'brian@autolocal.ai',
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
  template text DEFAULT 'modern-clean',
  audit_id uuid REFERENCES audits(id) ON DELETE SET NULL,

  -- Status & tracking
  status text DEFAULT 'draft' CHECK (status IN ('draft','published')),
  view_count integer DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_previews_slug ON website_previews(slug);
CREATE INDEX idx_previews_status ON website_previews(status);
CREATE INDEX idx_previews_audit ON website_previews(audit_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_preview_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER previews_updated_at
  BEFORE UPDATE ON website_previews
  FOR EACH ROW EXECUTE FUNCTION update_preview_timestamp();

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
  ADD COLUMN contact_email text,
  ADD COLUMN hero_crop integer DEFAULT 50 CHECK (hero_crop BETWEEN 0 AND 100),
  ADD COLUMN site_mode text DEFAULT 'business' CHECK (site_mode IN ('business','individual')),
  ADD COLUMN plan text DEFAULT 'starter',
  ADD COLUMN hosting_status text DEFAULT 'preview' CHECK (hosting_status IN ('preview','active','expired')),
  ADD COLUMN stripe_customer_id text,
  ADD COLUMN trial_end timestamptz,
  ADD COLUMN custom_domain text,
  ADD COLUMN deploy_status text,
  ADD COLUMN domain_status text,
  ADD COLUMN domain_provider text,
  ADD COLUMN domain_registrar_id text,
  ADD COLUMN domain_auto_renew boolean DEFAULT true,
  ADD COLUMN domain_expires_at timestamptz;
ALTER TABLE public.audit_requests ALTER COLUMN city SET DEFAULT '', ALTER COLUMN state SET DEFAULT '';
ALTER TABLE public.outbound_emails
  ADD COLUMN business_name text, ADD COLUMN recipient_email text,
  ADD COLUMN approach_type text, ADD COLUMN sent_at timestamptz,
  ADD COLUMN report_viewed_at timestamptz, ADD COLUMN converted boolean DEFAULT false,
  ADD COLUMN follow_up_day integer, ADD COLUMN parent_email_id uuid REFERENCES public.outbound_emails(id),
  ADD COLUMN scheduled_for timestamptz, ADD COLUMN error_message text;

CREATE TABLE public.change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id uuid REFERENCES public.website_previews(id) ON DELETE CASCADE,
  preview_slug text, business_name text, type text DEFAULT 'general',
  message text NOT NULL, priority text DEFAULT 'normal', cost numeric DEFAULT 0,
  status text DEFAULT 'pending', created_at timestamptz DEFAULT now()
);
CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), type text DEFAULT 'feedback',
  message text NOT NULL, slug text, email text, status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.unsubscribes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
  unsubscribed_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now()
);
CREATE TABLE public.drip_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preview_id uuid REFERENCES public.website_previews(id) ON DELETE CASCADE,
  email text NOT NULL, stage text NOT NULL, step integer NOT NULL,
  slug text, business_name text, contact_name text,
  status text DEFAULT 'active', send_at timestamptz NOT NULL,
  sent_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.site_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slug text NOT NULL, name text NOT NULL,
  email text, phone text, message text, instrument text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.research_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  business_name text, data jsonb, status text, created_at timestamptz DEFAULT now()
);
CREATE INDEX previews_owner_email ON public.website_previews(email);
CREATE INDEX changes_preview_created ON public.change_requests(preview_id, created_at);
CREATE INDEX drip_due ON public.drip_queue(send_at) WHERE status = 'active';
CREATE INDEX leads_site_created ON public.site_leads(slug, created_at);

-- Both generations of change-request routes stay in sync.
CREATE FUNCTION public.resolve_change_preview() RETURNS trigger
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
CREATE TRIGGER change_preview BEFORE INSERT OR UPDATE OF preview_id, preview_slug
ON public.change_requests FOR EACH ROW EXECUTE FUNCTION public.resolve_change_preview();

-- Operational data stays behind authenticated server routes.
ALTER TABLE public.audit_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_requests FROM anon, authenticated;
GRANT ALL ON public.audit_requests TO service_role;
CREATE POLICY service_access ON public.audit_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audits FROM anon, authenticated;
GRANT ALL ON public.audits TO service_role;
CREATE POLICY service_access ON public.audits FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.outbound_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.outbound_emails FROM anon, authenticated;
GRANT ALL ON public.outbound_emails TO service_role;
CREATE POLICY service_access ON public.outbound_emails FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clients FROM anon, authenticated;
GRANT ALL ON public.clients TO service_role;
CREATE POLICY service_access ON public.clients FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.website_previews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.website_previews FROM anon, authenticated;
GRANT ALL ON public.website_previews TO service_role;
CREATE POLICY service_access ON public.website_previews FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.change_requests FROM anon, authenticated;
GRANT ALL ON public.change_requests TO service_role;
CREATE POLICY service_access ON public.change_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback FROM anon, authenticated;
GRANT ALL ON public.feedback TO service_role;
CREATE POLICY service_access ON public.feedback FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.unsubscribes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.unsubscribes FROM anon, authenticated;
GRANT ALL ON public.unsubscribes TO service_role;
CREATE POLICY service_access ON public.unsubscribes FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.drip_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.drip_queue FROM anon, authenticated;
GRANT ALL ON public.drip_queue TO service_role;
CREATE POLICY service_access ON public.drip_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.site_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_leads FROM anon, authenticated;
GRANT ALL ON public.site_leads TO service_role;
CREATE POLICY service_access ON public.site_leads FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.businesses FROM anon, authenticated;
GRANT ALL ON public.businesses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
CREATE POLICY owner_access ON public.businesses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER TABLE public.brand_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.brand_profiles FROM anon, authenticated;
GRANT ALL ON public.brand_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_profiles TO authenticated;
CREATE POLICY owner_access ON public.brand_profiles FOR ALL TO authenticated USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())) WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.posts FROM anon, authenticated;
GRANT ALL ON public.posts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
CREATE POLICY owner_access ON public.posts FOR ALL TO authenticated USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())) WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.social_connections FROM anon, authenticated;
GRANT ALL ON public.social_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_connections TO authenticated;
CREATE POLICY owner_access ON public.social_connections FOR ALL TO authenticated USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())) WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT ALL ON public.subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
CREATE POLICY owner_access ON public.subscriptions FOR ALL TO authenticated USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())) WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));
ALTER TABLE public.research_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.research_results FROM anon, authenticated;
GRANT ALL ON public.research_results TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_results TO authenticated;
CREATE POLICY owner_access ON public.research_results FOR ALL TO authenticated USING (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())) WITH CHECK (business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid()));

REVOKE ALL ON FUNCTION public.increment_preview_views(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_preview_views(text) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_change_preview() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.increment_preview_views(text) SET search_path = public;
ALTER FUNCTION public.update_preview_timestamp() SET search_path = public;

COMMIT;
