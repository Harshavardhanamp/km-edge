# Device acceptance runbook — KM-Edge 2.0.0 against GKS 2.1.0 (K7)

How to prepare and run `device-acceptance-checklist.md`. The checklist is the frozen template. Copy it to `device-acceptance-<date>.md` and record results there, one column per device.

## 1. Before the device run

1. GKS 2.1.0 candidate has passed the server qualification (`generational-knowledge-system/docs/implementation/KK-EDGE-SYNC-QUALIFICATION.md`: L1, L2 and frontend).
2. KM-Edge Jest and typecheck are green:
   ```
   cd km-edge/src
   npm install            # K7 added seven dependencies to package.json; this refreshes package-lock.json — commit it
   npm test
   npx tsc --noEmit
   ```
3. Build an installable app from `km-edge/src` (EAS development build or a local APK, per the Expo SDK 57 docs). The build must report app version **2.0.0**; Family Access → Devices shows it.

## 2. Servers

Use a scratch server for rows that change server behaviour. Use the family server only for rows that don't.

| Server | Command | Used for |
|---|---|---|
| Scratch | `python scripts/edge_scratch_server.py --port 8790 --member-username member --archive ~/gks-k7-scratch/archive` (a fixed `--archive` keeps state across restarts; put it behind `tailscale serve` for the phone) | All rows; required for 6.3 and 6.5 |
| Scratch, contract v2 only | Restart the scratch server with `GKS_EDGE_CONTRACT_VERSIONS=2` | Row 6.3: phone shows "Update KM-Edge to keep syncing." with no rejected items. Restart without the variable afterwards and the banner clears on the next sync. |
| Scratch, stale threshold | `GKS_EDGE_STALE_DAYS=1` (the minimum), then leave the phone unsynced for more than a day | Row 6.5 Home line |

Never set `GKS_EDGE_CONTRACT_VERSIONS` on the family server; every phone would stop syncing.

The sync log for row 9.1 is at `<archive>/System/edge/sync-log.jsonl`.

## 3. As-built notes per row

These explain how the built app satisfies a row, where the checklist wording could be read more than one way. They do not change the frozen expectations.

| Row | Note |
|---|---|
| 0.12 | The phone returns to Login on the next request after revoke. It does not happen instantly while idle. |
| 2.2 | Labels to resolve sits at the top of Needs review → From phone → Pending. Each row has Link to … (exact matches only), Create topic, Create place and Drop; each applies to every record with that label. |
| 2.7 | After Dismiss, the record detail page shows "Phone labels (not linked)" chips. There is no "Resolve labels" link, because dismissed labels leave the review queue. |
| 6.2 | StatusDetail shows "Waiting to sync (1)"; "Last synced" on Home and StatusDetail keeps the previous value. |
| 6.3 | Uses the scratch override above. |
| 6.4 | Needs attention shows "This record is too long to sync (limit 100,000 characters)." with an **Edit** button that opens the record. Type-locked records and file problems show **Open record**. Retryable problems show **Retry**. |
| 9.2 | Settings → About → How syncing works. |

## 3a. KM-Edge 2.1 — structure at capture (KK-2.2 E2, against GKS 2.7.0)

Run after the 2.0 rows. Build the app from the 2.1 commit, and use the scratch server from GKS 2.7.0. Record the rows in the same results file.

| Row | Steps | Expected |
|---|---|---|
| E-AC1 | Sync once. Turn on airplane mode. Capture a note and Save. | The card opens with "Offline" and no suggestions. A cached Topic can be picked. After Confirm and airplane mode off, it syncs; on the web the Topic is linked and the record is not in From phone. |
| E-AC2 | Type a Topic "Mysuru trip" that does not exist and Confirm. | After sync, From phone lists the record with only that label. The phone shows "Waiting for the desktop to match: Mysuru trip". |
| E-AC3 | Local AI warm on the server. Save a note and accept the suggested Topic. | Chips appear within 3 s. On the web, the record history shows `accepted_ai_suggestion` with `surface: km-edge`. |
| E-AC4 | Stop Ollama on the server. Save a note. | The card opens at once and shows "taking a while", then "unavailable". Nothing blocks Confirm except the gate. |
| E-AC5 | Clear Topics, People and Place. | Confirm is disabled and says why. |
| E-AC6 | Create a person on the web; do not sync the phone. Type the exact name and Confirm. | After sync, the person is linked and there is no From phone entry. |
| E-AC7 | Pick a cached Topic, then merge or delete it on the web before syncing. | The record links by label, or waits in From phone; no error is shown. |
| E-AC8 | A 2.0 phone against GKS 2.7.0; a 2.1 phone against a server started with `GKS_EDGE_CONTRACT_VERSIONS=1`. | The 2.0 phone syncs as before. The 2.1 phone shows "Ask your administrator to update Kashyap’s Knowledge." and loses nothing. |
| E-AC9 | Scratch archive with 6,000 people (`tests/test_kk22_e2_edge_v2.py` fixture builder). Sync. | The cache fills and a name from the last page can be found in the picker. |
| E-draft | Type on the card, close the app, reopen it. | The card reopens with the text. Discard clears it. |

## 4. After the run

- Every row PASS or N/A (with a reason): fill in the sign-off table. Then tag KM-Edge `v2.0.0` (annotated), push `main` and the tag, verify the remote, and confirm a clean worktree. Release the GKS tags per its qualification record.
- Any FAIL: record it, fix it in a follow-up commit, and re-run the affected rows.
