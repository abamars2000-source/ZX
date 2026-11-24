# ZX Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Identity Integrity**: Every user-scoped document (`public/profile`, `private/info`, `aiThreads`, `aiTranscripts`) MUST have `uid`/`ownerId == request.auth.uid` on create and remain immutable on update.
2. **Verified Email Mandate**: All non-public writes and private reads require `request.auth.token.email_verified == true`.
3. **PII Isolation**: Email addresses live exclusively under `/users/{userId}/private/info` and are strictly unreadable/unwritable by anyone other than `userId` or a verified admin.
4. **Master Gate Relational Integrity**: Messages under `/users/{userId}/aiThreads/{threadId}/messages/{messageId}` CANNOT exist unless `/users/{userId}/aiThreads/{threadId}` exists and is owned by `request.auth.uid`, and `incoming().threadId == threadId`.
5. **Temporal Integrity & Immutability**: `createdAt` MUST equal `request.time` on creation and MUST remain unchanged on updates; `updatedAt` MUST equal `request.time` on creation and updates.
6. **Zero-Trust Payload Constraints**: Extra shadow fields (e.g., `isAdmin`, `isVerified`, `role`), oversized strings, invalid document IDs, and unsupported model IDs are strictly rejected.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Write**: `request.auth == null` creating `/users/u1/aiThreads/t1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `request.auth.token.email == 'abamars2000@gmail.com'`, `email_verified == false` reading `/admins/a1` -> `PERMISSION_DENIED`.
3. **Cross-User Ownership Spoof**: User `u2` creating `/users/u2/aiThreads/t1` with `ownerId: 'u1'` -> `PERMISSION_DENIED`.
4. **Cross-Path Thread Creation**: User `u2` creating `/users/u1/aiThreads/t1` with `ownerId: 'u2'` -> `PERMISSION_DENIED`.
5. **PII Blanket Read Attack**: Authenticated user `u2` reading `/users/u1/private/info` -> `PERMISSION_DENIED`.
6. **Shadow Field Injection**: User `u1` creating `/users/u1/public/profile` with extra `isVerified: true` or `role: 'admin'` -> `PERMISSION_DENIED`.
7. **Orphaned Message Attack**: User `u1` creating `/users/u1/aiThreads/nonexistent/messages/m1` -> `PERMISSION_DENIED`.
8. **ID Poisoning Attack**: User `u1` creating `/users/u1/aiThreads/bad..id$with#chars!` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: User `u1` creating `AiThread` with `createdAt: '2020-01-01T00:00:00Z'` instead of `request.time` -> `PERMISSION_DENIED`.
10. **Immutable Field Mutation**: User `u1` updating `AiThread` to mutate `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
11. **Value Poisoning / Oversized Payload**: User `u1` creating `AiMessage` with `content` length > 16000 or invalid `role: 'system'` -> `PERMISSION_DENIED`.
12. **Privilege Escalation**: Non-admin user `u1` writing `/admins/u1` -> `PERMISSION_DENIED`.
