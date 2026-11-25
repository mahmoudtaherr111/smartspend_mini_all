# 0054. Recording item identity and stored spending purpose

Status: accepted for implementation behind the recording settings.

## Context

Two purchases can cost the same amount and have the same accounting filing while serving different purposes. Using amount to match a saved item to its reading then loses the specific purpose and can misattribute corrections or a commitment.

## Decision

A server-issued item id is scoped to its owner's reading. A write from an updated client carries that id through review and retries. Older clients retain the single-item or unique-amount match. Spending rows carry versioned purpose ids where the original reading or a unique filing supports them. The existing filing keeps old clients and broad historical records usable.

Each clean, independently quoted purchase can be booked while another waits for an amount. Booking and opening its follow-up questions share a database transaction and a durable replay result. Uncertainty about the whole sentence keeps the items together. Live calls continue to require confirmation.

## Release

Keep the rules engine available through the initial rollout. Retiring it requires independent text and audio evidence, reconciled accounts, deployment monitoring with a tested rollback, and fourteen consecutive days on the full pilot. Synthetic examples exercise generalization and regressions. They cannot establish speaker-level field accuracy.
