-- Run after rebuild.sql in the replacement Supabase project.
-- Public website images; uploads require the server service role.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('client-assets', 'client-assets', true, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','image/gif','image/svg+xml'])
ON CONFLICT (id) DO NOTHING;
