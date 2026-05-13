# Security Specification for Mani AI Analytics

## Data Invariants
1. `stats/global` doc must always exist (or we create it if missing).
2. `daily_stats/{date}` doc corresponds to a specific day.
3. Counters can only be incremented by 1 at a time by clients to prevent abuse.

## The "Dirty Dozen" Payloads (Denial Tests)
1. Setting `totalUsers` to -1.
2. Setting `totalUsers` to 999999999 in one go.
3. Deleting the `global` stats.
4. Changing the `date` in a `daily_stats` document.
5. Updating `totalUsers` without being a "new user" (hard to enforce strictly client-side without auth, but we'll try to gate the increment).
6. Overwriting the entire document with random fields.
7. Reading private system config (none in this app yet, but we deny all by default).
8. Creating a `daily_stats` for a future date (too far in future).
9. Updating `visits` by more than 1.
10. Attempting to list all `daily_stats` (preventing scraping).
11. Anonymous writes to random collections.
12. Authenticated user trying to delete stats.

## Test Strategy
We will ensure `allow read` is open for public dashboarding, but `allow update` is strictly limited to incremental changes on specific fields.
