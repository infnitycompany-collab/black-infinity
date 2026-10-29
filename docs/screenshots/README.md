# Actual browser page captures

Run `npm run test:e2e` to generate desktop, tablet and mobile PNGs for every implemented page, plus Arabic and offline proof captures. These use the real application with isolated test accounts and generated playable media. They are not design mockups.

PNG files are intentionally excluded from source commits. GitHub Actions uploads them as a retained artifact, and the verified capture set is on the separate **Actual Browser Photos (Raster Proofs)** Figma page. Editable design frames live on **Responsive Product Screens**.

Never capture expanded recovery secrets, invitation tokens, user exports or real private media for public artifacts.

The communication expansion adds chats/groups/channels page captures and open-thread proofs at three viewport sizes, plus Arabic channel proofs. New captures remain local and in CI artifacts while Figma's Starter quota blocks synchronization. The Figma photo page contains an older partial capture set; it is not a mirror of every current local screenshot.
