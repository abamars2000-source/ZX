-- ZX: India's Social Universe
-- Migration 003: Supabase Storage Buckets & Policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('covers', 'covers', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('post-images', 'post-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('videos', 'videos', true, 52428800, ARRAY['video/mp4', 'video/webm', 'video/quicktime']),
  ('stories', 'stories', true, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('shorts', 'shorts', true, 52428800, ARRAY['video/mp4', 'video/webm', 'video/quicktime']),
  ('chat-attachments', 'chat-attachments', false, 26214400, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated upload to user folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('avatars', 'covers', 'post-images', 'videos', 'stories', 'shorts', 'chat-attachments')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owner delete own files"
ON storage.objects FOR DELETE TO authenticated
USING ((storage.foldername(name))[1] = auth.uid()::text);
