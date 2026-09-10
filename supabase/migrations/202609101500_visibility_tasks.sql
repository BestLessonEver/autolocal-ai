-- Additive visibility task storage. No scheduled job is activated by this migration.
BEGIN;
ALTER TABLE public.website_previews
 ADD COLUMN IF NOT EXISTS visibility_last_checked_at timestamptz,
 ADD COLUMN IF NOT EXISTS visibility_next_check_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS visibility_claimed_at timestamptz;
CREATE TABLE IF NOT EXISTS public.visibility_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES public.website_previews(id), owner_id uuid NOT NULL,
 task_key text NOT NULL, title text NOT NULL, description text NOT NULL,
 priority text NOT NULL CHECK(priority IN ('high','medium','low')), rank integer NOT NULL,
 evidence jsonb NOT NULL DEFAULT '[]', source jsonb NOT NULL, action jsonb NOT NULL,
 source_revision text NOT NULL, inference boolean NOT NULL DEFAULT false, context jsonb NOT NULL DEFAULT '{}',
 evidence_expires_at timestamptz, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','dismissed','completed')),
 completion jsonb, owner_updated_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id,task_key)
);
CREATE INDEX IF NOT EXISTS visibility_tasks_owner_plan ON public.visibility_tasks(site_id,status,rank DESC);
CREATE INDEX IF NOT EXISTS visibility_sites_due ON public.website_previews(visibility_next_check_at) WHERE owner_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reconcile_visibility_tasks(p_site_id uuid,p_owner_id uuid,p_tasks jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE item jsonb; task_owner uuid;
BEGIN
 IF jsonb_typeof(p_tasks)<>'array' OR jsonb_array_length(p_tasks)>50 THEN RAISE EXCEPTION 'Invalid task batch'; END IF;
 SELECT owner_id INTO task_owner FROM website_previews WHERE id=p_site_id FOR SHARE;
 IF task_owner IS NULL OR task_owner IS DISTINCT FROM p_owner_id THEN RAISE EXCEPTION 'Website ownership changed'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_tasks) LOOP
  INSERT INTO visibility_tasks(site_id,owner_id,task_key,title,description,priority,rank,evidence,source,action,source_revision,inference,context,evidence_expires_at,status,completion,updated_at)
  VALUES(p_site_id,task_owner,item->>'task_key',item->>'title',item->>'description',item->>'priority',(item->>'rank')::integer,
   item->'evidence',item->'source',item->'action',item->>'source_revision',(item->>'inference')::boolean,item->'context',
   (item->>'evidence_expires_at')::timestamptz,item->>'status',nullif(item->'completion','null'::jsonb),(item->>'updated_at')::timestamptz)
  ON CONFLICT(site_id,task_key) DO UPDATE SET owner_id=excluded.owner_id,title=excluded.title,description=excluded.description,priority=excluded.priority,rank=excluded.rank,
   evidence=excluded.evidence,source=excluded.source,action=excluded.action,source_revision=excluded.source_revision,inference=excluded.inference,
   context=excluded.context,evidence_expires_at=excluded.evidence_expires_at,status=excluded.status,completion=excluded.completion,updated_at=excluded.updated_at,
   owner_updated_at=CASE WHEN visibility_tasks.owner_id<>excluded.owner_id THEN NULL ELSE visibility_tasks.owner_updated_at END
  WHERE visibility_tasks.owner_id<>excluded.owner_id OR (visibility_tasks.updated_at<=excluded.updated_at AND (visibility_tasks.owner_updated_at IS NULL OR visibility_tasks.owner_updated_at<=excluded.updated_at));
 END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_visibility_site()
RETURNS TABLE(id uuid) LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 -- Provider-derived query/profile evidence has a bounded lifetime, including completed/dismissed tasks.
 UPDATE visibility_tasks SET evidence='[]',context='{}' WHERE evidence_expires_at<=now() AND (evidence<>'[]'::jsonb OR context<>'{}'::jsonb);
 RETURN QUERY UPDATE website_previews w SET visibility_claimed_at=now(),visibility_next_check_at=now()+interval '1 day'
 WHERE w.id=(SELECT p.id FROM website_previews p WHERE p.owner_id IS NOT NULL
  AND ((p.visibility_next_check_at<=now() AND p.visibility_claimed_at IS NULL) OR p.visibility_claimed_at<now()-interval '10 minutes')
  ORDER BY p.visibility_next_check_at,p.id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING w.id;
END;
$$;
ALTER TABLE public.visibility_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.visibility_tasks FROM anon,authenticated;
GRANT ALL ON public.visibility_tasks TO service_role;
DROP POLICY IF EXISTS visibility_service_access ON public.visibility_tasks;
CREATE POLICY visibility_service_access ON public.visibility_tasks FOR ALL TO service_role USING(true) WITH CHECK(true);
REVOKE ALL ON FUNCTION public.reconcile_visibility_tasks(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_visibility_tasks(uuid,uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.claim_visibility_site() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_visibility_site() TO service_role;
COMMIT;
