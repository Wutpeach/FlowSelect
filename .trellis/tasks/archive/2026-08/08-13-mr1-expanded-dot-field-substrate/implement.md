# MR1 Expanded Dot Field - Implementation Plan

1. Add pure bounded topology/material/origin policy and fake-scheduler runtime tests.
2. Implement the minimum Dot Field-specific Canvas host/runtime with latest-replaces retarget and wake/sleep/dispose generation guards.
3. Compose behind existing Surface children; wire projection/theme/DPR/reduced motion and local click/context intents through existing gesture paths.
4. Extend MR0 architecture guards and focused regression tests without production abstractions.
5. Run focused tests, full `npm test`, `npm run type-check`, `npm run lint`, `npm run build`, `git diff --check`, then Windows Electron/manual/performance validation.

Do not implement MR2, M3, Windows repairs, or shared motion/renderer infrastructure.
