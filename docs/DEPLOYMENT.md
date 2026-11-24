# Deployment & Free-Tier Architecture Guide — ZX

## Production Stack (Free-Tier Compatible)

1. **Frontend Hosting**: Cloudflare Pages (connected via GitHub)
   - Build command: `npm run build`
   - Output directory: `dist`
2. **Backend Database, Auth, Storage & Realtime**: Supabase (Free Tier)
   - Apply SQL migrations in order from `supabase/migrations/`:
     1. `001_initial_schema.sql`
     2. `002_rls_and_functions.sql`
     3. `003_storage_buckets.sql`
3. **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
   - `ADMIN_BOOTSTRAP_SECRET` (server-side only)

## Free-Tier Limitations & Media Optimization

- **Storage & Bandwidth**: Supabase Free Tier includes 500 MB database storage, 1 GB file storage, and limited monthly egress. Do **not** assume unlimited free video hosting.
- **Image Compression**: ZX automatically resizes and converts large uploaded photos client-side to WebP (`<= 1600px`) before upload.
- **File Caps**: Avatars max 5 MB, Covers max 8 MB, Post Images max 10 MB, Short Videos max 50 MB.
- **Admin Security**: Never hardcode admin credentials in frontend code. Configure `ADMIN_BOOTSTRAP_SECRET` on the server or claim first-owner access once via `/admin`.
