# Testing Documentation — ZX

## Manual & Automated Verification Checklist

1. **Zero-State Launch**:
   - Verify `/api/health` returns `{ ok: true, users: 0, posts: 0 }`.
   - Confirm Home, ZX, Stories, Shorts, Explore, Notifications, and Messages display clean Hindi empty states.
2. **Registration & Onboarding**:
   - Register first account with full name, unique username, email, matching passwords, and accepted terms.
   - Verify email token via `/api/auth/verify-email` or UI modal.
   - Complete onboarding (avatar upload, bio, language `hi`/`en`, interests, public/private privacy).
3. **Social Graph & Privacy**:
   - Register second user. Test follow/unfollow on public account and follow-request approve/reject on private account.
   - Test blocking and muting to confirm blocked users' posts and messages are hidden.
4. **Content Creation (Home, ZX, Stories, Shorts)**:
   - Publish a Home carousel post, edit/delete it, like, comment, repost, and bookmark.
   - Publish a ZX post with `#hashtag`, `@mention`, poll (vote persistence), and quote post.
   - Publish a Story (image/video/text), verify viewer list as author, react as second user, pin to Highlights.
   - Upload a vertical Short video, verify auto-play, mute toggle, view count increment, and comments.
5. **Real-Time Messaging & Notifications**:
   - Open two browser sessions; send a 1:1 message and confirm instant WebSocket delivery, typing indicator, read receipt, and real-time notification badge increment.
6. **Creator Studio & Admin Control Panel**:
   - Confirm Creator Studio displays exact database metrics with `7D`/`30D`/`All` filters.
   - Claim first-owner admin on `/admin` and verify user suspension/ban, verification approval, report resolution, announcement creation, and audit log entry.
