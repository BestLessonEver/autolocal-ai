-- Shared public-request budgets. Hashes only; no raw IPs or request bodies.
BEGIN;
CREATE TABLE IF NOT EXISTS public.public_request_limits(
 scope text NOT NULL,bucket_hash text NOT NULL,count integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,
 PRIMARY KEY(scope,bucket_hash)
);
CREATE INDEX IF NOT EXISTS public_request_limits_expiry ON public.public_request_limits(expires_at);
ALTER TABLE public.public_request_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_request_limits FROM anon,authenticated;
GRANT ALL ON public.public_request_limits TO service_role;
DROP POLICY IF EXISTS public_limit_service_access ON public.public_request_limits;
CREATE POLICY public_limit_service_access ON public.public_request_limits FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE OR REPLACE FUNCTION public.consume_public_request_budget(p_scope text,p_client_hash text)
RETURNS TABLE(allowed boolean,retry_after integer) LANGUAGE plpgsql SET search_path=public AS $$
DECLARE client_max int;client_seconds int;daily_max int;global_key text;next_day timestamptz;global_row public_request_limits;client_row public_request_limits;
BEGIN
 IF p_scope='google-places' THEN client_max:=30;client_seconds:=600;daily_max:=1000;
 ELSIF p_scope='contact' THEN client_max:=5;client_seconds:=3600;daily_max:=200;
 ELSE RAISE EXCEPTION 'Unsupported public request budget'; END IF;
 IF p_client_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid private client key'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('public-budget:'||p_scope));
 DELETE FROM public_request_limits WHERE expires_at<now()-interval '1 day';
 global_key:='global:'||to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD');
 next_day:=((now() AT TIME ZONE 'UTC')::date+1)::timestamp AT TIME ZONE 'UTC';
 SELECT * INTO global_row FROM public_request_limits WHERE scope=p_scope AND bucket_hash=global_key;
 IF global_row.count>=daily_max THEN RETURN QUERY SELECT false,greatest(1,ceil(extract(epoch FROM(next_day-now())))::int);RETURN;END IF;
 SELECT * INTO client_row FROM public_request_limits WHERE scope=p_scope AND bucket_hash=p_client_hash;
 IF client_row.expires_at>now() AND client_row.count>=client_max THEN RETURN QUERY SELECT false,greatest(1,ceil(extract(epoch FROM(client_row.expires_at-now())))::int);RETURN;END IF;
 INSERT INTO public_request_limits(scope,bucket_hash,count,expires_at) VALUES(p_scope,p_client_hash,1,now()+make_interval(secs=>client_seconds))
 ON CONFLICT(scope,bucket_hash) DO UPDATE SET count=CASE WHEN public_request_limits.expires_at<=now() THEN 1 ELSE public_request_limits.count+1 END,expires_at=CASE WHEN public_request_limits.expires_at<=now() THEN excluded.expires_at ELSE public_request_limits.expires_at END;
 INSERT INTO public_request_limits(scope,bucket_hash,count,expires_at) VALUES(p_scope,global_key,1,next_day)
 ON CONFLICT(scope,bucket_hash) DO UPDATE SET count=public_request_limits.count+1;
 RETURN QUERY SELECT true,0;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_public_request_budget(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_request_budget(text,text) TO service_role;
COMMIT;
