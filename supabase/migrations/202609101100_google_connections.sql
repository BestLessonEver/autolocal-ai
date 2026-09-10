-- Additive Google connection storage. Apply only in a coordinated release.
BEGIN;
CREATE TABLE IF NOT EXISTS public.google_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES public.website_previews(id),owner_id uuid NOT NULL REFERENCES auth.users(id),
 provider text NOT NULL CHECK(provider IN ('gbp','search_console')),
 status text NOT NULL DEFAULT 'needs_selection' CHECK(status IN ('needs_selection','connected','reauth_required','permission_required','disconnected','error')),
 tokens_ciphertext text,token_expires_at timestamptz,granted_scope text,
 resource_name text,resource_label text,account_name text,
 profile jsonb,metrics jsonb,profile_revision text,last_synced_at timestamptz,error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(site_id,provider)
);
CREATE TABLE IF NOT EXISTS public.google_oauth_states (
 state_hash text PRIMARY KEY,browser_hash text NOT NULL,user_id uuid NOT NULL REFERENCES auth.users(id),site_id uuid NOT NULL REFERENCES public.website_previews(id),
 provider text NOT NULL CHECK(provider IN ('gbp','search_console')),verifier_ciphertext text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.consume_google_oauth_state(p_state_hash text,p_browser_hash text,p_user_id uuid)
RETURNS SETOF public.google_oauth_states LANGUAGE sql SET search_path=public AS $$
 DELETE FROM google_oauth_states WHERE state_hash=p_state_hash AND browser_hash=p_browser_hash AND user_id=p_user_id AND expires_at>now() RETURNING *;
$$;
CREATE TABLE IF NOT EXISTS public.google_change_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),site_id uuid NOT NULL REFERENCES public.website_previews(id),connection_id uuid NOT NULL REFERENCES public.google_connections(id),
 owner_id uuid NOT NULL REFERENCES auth.users(id),resource_name text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','applying','applied','stale','rejected','needs_review')),
 base_revision text NOT NULL,before_profile jsonb NOT NULL,changes jsonb NOT NULL,
 provider_result jsonb,error_code text,approved_at timestamptz,applied_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.google_change_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),proposal_id uuid NOT NULL REFERENCES public.google_change_proposals(id),
 actor_id uuid REFERENCES auth.users(id),event_type text NOT NULL,source text NOT NULL DEFAULT 'AutoLocal',evidence jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS google_connection_one_apply ON public.google_change_proposals(connection_id) WHERE status='applying';
CREATE OR REPLACE FUNCTION public.claim_google_proposal(p_id uuid,p_owner_id uuid,p_revision text)
RETURNS SETOF public.google_change_proposals LANGUAGE plpgsql SET search_path=public AS $$
DECLARE claimed google_change_proposals;
BEGIN
 UPDATE google_change_proposals SET status='applying',approved_at=now() WHERE id=p_id AND owner_id=p_owner_id AND base_revision=p_revision AND status='draft' RETURNING * INTO claimed;
 IF claimed.id IS NOT NULL THEN
  INSERT INTO google_change_events(proposal_id,actor_id,event_type,evidence) VALUES(claimed.id,p_owner_id,'owner_approved',jsonb_build_object('base_revision',p_revision,'changes',claimed.changes));
  RETURN NEXT claimed;
 END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.finish_google_proposal(p_id uuid,p_status text,p_result jsonb,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF p_status NOT IN ('applied','stale','rejected','needs_review') THEN RAISE EXCEPTION 'Invalid proposal outcome'; END IF;
 UPDATE google_change_proposals SET status=p_status,provider_result=p_result,error_code=p_error,applied_at=CASE WHEN p_status='applied' THEN now() ELSE NULL END WHERE id=p_id AND status='applying';
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposal is not applying'; END IF;
 INSERT INTO google_change_events(proposal_id,event_type,source,evidence) VALUES(p_id,p_status,'Google Business Information API',coalesce(p_result,'{}'));
END;
$$;
-- Purge at 29 days, leaving a one-day margin for the verified daily scheduler.
CREATE OR REPLACE FUNCTION public.expire_google_cached_content()
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE expired_profiles int;expired_metrics int;expired_proposals int;expired_events int;
BEGIN
 UPDATE google_connections SET profile=null,profile_revision=null,resource_label=null WHERE profile IS NOT NULL AND coalesce(nullif(profile->>'observedAt','')::timestamptz,last_synced_at,created_at)<now()-interval '29 days';
 GET DIAGNOSTICS expired_profiles=ROW_COUNT;
 UPDATE google_connections SET metrics=null WHERE metrics IS NOT NULL AND coalesce(nullif(metrics->>'observedAt','')::timestamptz,last_synced_at,created_at)<now()-interval '29 days';
 GET DIAGNOSTICS expired_metrics=ROW_COUNT;
 UPDATE google_connections SET resource_label=null WHERE resource_label IS NOT NULL AND coalesce(last_synced_at,created_at)<now()-interval '29 days';
 UPDATE google_change_proposals SET before_profile='{}',provider_result=null,status=CASE WHEN status='draft' THEN 'stale' ELSE status END,error_code=CASE WHEN status='draft' THEN 'cache_expired' ELSE error_code END WHERE created_at<now()-interval '29 days' AND (before_profile<>'{}' OR provider_result IS NOT NULL OR status='draft');
 GET DIAGNOSTICS expired_proposals=ROW_COUNT;
 UPDATE google_change_events SET evidence='{}' WHERE source='Google Business Information API' AND created_at<now()-interval '29 days' AND evidence<>'{}';
 GET DIAGNOSTICS expired_events=ROW_COUNT;
 DELETE FROM google_oauth_states WHERE expires_at<now();
 RETURN jsonb_build_object('profiles',expired_profiles,'metrics',expired_metrics,'proposals',expired_proposals,'events',expired_events);
END;
$$;
REVOKE ALL ON FUNCTION public.expire_google_cached_content() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_google_cached_content() TO service_role;
DO $$DECLARE table_name text;BEGIN
 FOREACH table_name IN ARRAY ARRAY['google_connections','google_oauth_states','google_change_proposals','google_change_events'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',table_name);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',table_name);
  EXECUTE format('DROP POLICY IF EXISTS google_service_access ON public.%I',table_name);
  EXECUTE format('CREATE POLICY google_service_access ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',table_name);
 END LOOP;
END$$;
REVOKE ALL ON FUNCTION consume_google_oauth_state(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION consume_google_oauth_state(text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION claim_google_proposal(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION claim_google_proposal(uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION finish_google_proposal(uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION finish_google_proposal(uuid,text,jsonb,text) TO service_role;
COMMIT;
