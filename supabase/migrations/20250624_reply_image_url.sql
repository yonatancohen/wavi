-- Persist generated reply images (storage path, not public URL)
ALTER TABLE replies
  ADD COLUMN IF NOT EXISTS image_url text;

-- Private bucket for WhatsApp reply images (signed URLs served by API)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reply-images',
  'reply-images',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Service role uploads via API; dashboard reads via createSignedUrl only — no public SELECT policy.

NOTIFY pgrst, 'reload schema';
