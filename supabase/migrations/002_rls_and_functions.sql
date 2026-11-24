-- ZX: India's Social Universe
-- Migration 002: Row Level Security (RLS) & Helper Functions

CREATE OR REPLACE FUNCTION public.is_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles WHERE user_id = check_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(viewer_id UUID, target_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = target_profile_id AND blocked_id = viewer_id)
       OR (blocker_id = viewer_id AND blocked_id = target_profile_id)
  )
  AND (
    target_profile_id = viewer_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target_profile_id AND p.is_private = FALSE)
    OR EXISTS (SELECT 1 FROM public.follows f WHERE f.follower_id = viewer_id AND f.following_id = target_profile_id)
  );
$$;

-- Enable RLS across all 28 tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_views ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select_visible" ON public.profiles FOR SELECT
  USING (account_status = 'active' OR id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- Follows & requests
CREATE POLICY "follows_select_all" ON public.follows FOR SELECT USING (TRUE);
CREATE POLICY "follows_insert_own" ON public.follows FOR INSERT WITH CHECK (follower_id = auth.uid());
CREATE POLICY "follows_delete_own" ON public.follows FOR DELETE
  USING (follower_id = auth.uid() OR following_id = auth.uid());

CREATE POLICY "follow_requests_select_involved" ON public.follow_requests FOR SELECT
  USING (requester_id = auth.uid() OR target_id = auth.uid());
CREATE POLICY "follow_requests_insert_own" ON public.follow_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());
CREATE POLICY "follow_requests_update_target" ON public.follow_requests FOR UPDATE
  USING (target_id = auth.uid());

-- Posts & media
CREATE POLICY "posts_select_allowed" ON public.posts FOR SELECT
  USING (is_removed = FALSE AND public.can_view_profile(auth.uid(), author_id));
CREATE POLICY "posts_insert_own" ON public.posts FOR INSERT
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "posts_update_own" ON public.posts FOR UPDATE
  USING (author_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "posts_delete_own" ON public.posts FOR DELETE
  USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "post_media_select" ON public.post_media FOR SELECT USING (TRUE);
CREATE POLICY "post_media_insert" ON public.post_media FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.author_id = auth.uid()));

-- Engagement
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (is_removed = FALSE);
CREATE POLICY "comments_insert" ON public.comments FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "comments_delete" ON public.comments FOR DELETE
  USING (author_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "likes_select" ON public.likes FOR SELECT USING (TRUE);
CREATE POLICY "likes_manage" ON public.likes FOR ALL USING (user_id = auth.uid());

CREATE POLICY "reposts_select" ON public.reposts FOR SELECT USING (TRUE);
CREATE POLICY "reposts_manage" ON public.reposts FOR ALL USING (user_id = auth.uid());

CREATE POLICY "bookmarks_own" ON public.bookmarks FOR ALL USING (user_id = auth.uid());

-- Stories
CREATE POLICY "stories_select_allowed" ON public.stories FOR SELECT
  USING ((expires_at > NOW() OR is_highlight = TRUE) AND public.can_view_profile(auth.uid(), author_id));
CREATE POLICY "stories_insert_own" ON public.stories FOR INSERT WITH CHECK (author_id = auth.uid());
CREATE POLICY "stories_delete_own" ON public.stories FOR DELETE USING (author_id = auth.uid());

-- Notifications
CREATE POLICY "notifications_own" ON public.notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (recipient_id = auth.uid());

-- Messaging (strict participant isolation)
CREATE POLICY "conversations_member_select" ON public.conversations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = id AND m.user_id = auth.uid()));
CREATE POLICY "members_select" ON public.conversation_members FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = conversation_id AND m.user_id = auth.uid()
  ));
CREATE POLICY "messages_participant_select" ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = conversation_id AND m.user_id = auth.uid()));
CREATE POLICY "messages_participant_insert" ON public.messages FOR INSERT
  WITH CHECK (sender_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = conversation_id AND m.user_id = auth.uid()
  ));

-- Settings, Blocks, Mutes
CREATE POLICY "user_settings_own" ON public.user_settings FOR ALL USING (user_id = auth.uid());
CREATE POLICY "blocks_own" ON public.blocks FOR ALL USING (blocker_id = auth.uid());
CREATE POLICY "mutes_own" ON public.mutes FOR ALL USING (muter_id = auth.uid());

-- Admin & Moderation
CREATE POLICY "admin_roles_admin_read" ON public.admin_roles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "moderation_logs_admin_read" ON public.moderation_logs FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "reports_insert_auth" ON public.reports FOR INSERT WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports_admin_select" ON public.reports FOR SELECT
  USING (reporter_id = auth.uid() OR public.is_admin(auth.uid()));
