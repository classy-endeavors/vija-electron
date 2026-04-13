**Vijia**

Product Requirements Document

**Milestone 2 · Pre-Release Patch**

*v3.1  ·  April 2026*

| Stack | Electron 30+ · React 18 · TypeScript 5 · Vite |
| :---- | :---- |
| **Base PRD** | Vijia\_PRD\_Milestone2\_v3.docx |
| **Type** | Pre-release bug-fix patch — 6 issues blocking milestone sign-off |
| **Target OS** | macOS and/or Windows |
| **Status** | **Blocking milestone release — fix before sign-off** |

# **1  Overview**

This patch document captures six pre-release issues identified during QA of Milestone 2 (Floating Notification System). All six issues are blocking — the milestone will not be signed off until each is resolved.

Refer to Vijia\_PRD\_Milestone2\_v3.docx for the full functional specification. This document amends and supersedes the relevant sections of that base PRD. Where this document is silent, the base PRD requirements apply unchanged.

## **1.1  Issue Summary**

| \# | ID | Issue | FR Ref | Severity |
| :---- | :---- | :---- | :---- | :---- |
| 1 | **BUG-01** | Overlay window loses always-on-top when switching apps or taking a screenshot | FR-01 | **Critical** |
| 2 | **BUG-02** | Circle does not act as a clean toggle — second click does not collapse prompt bar and notification hub together | FR-01 / FR-04 | **High** |
| 3 | **BUG-03** | Notification area is not a fixed-height container; notifications overflow rather than scrolling within a bounded hub | FR-02 | **High** |
| 4 | **BUG-04** | Scrolling the notification hub only reveals the top 2 notifications, not the full history | FR-02 / FR-03 | **High** |
| 5 | **BUG-05** | Hovering on a notification erroneously triggers the prompt bar to open | FR-04 | **High** |
| 6 | **BUG-06** | Click-through is not reinstated after notifications fully fade; clicks in the faded notification area still do not pass through to the app behind | FR-01 / FR-03 | **High** |

# **2  Visual Context**

The screenshot below, supplied by QA, shows the Vijia overlay rendering at the top of the screen. The correct anchor is the bottom-right corner (per State 1 mockup in the base PRD). Investigate whether a window-positioning regression or a display-bounds calculation error is responsible, and restore the correct anchor as part of BUG-01 remediation.

![][image1]

Figure 1 — Overlay incorrectly anchored at screen top instead of bottom-right corner

# **3  Amended Functional Requirements**

The following requirements amend the base PRD. Each entry identifies the original FR it modifies or replaces. Requirements not listed here are unchanged.

| Requirement | Specification |
| :---- | :---- |
| **FR-01-P** **Always-On-Top Window (Patch)** **\[UPDATED\]** | Set alwaysOnTop: true with level 'screen-saver' (macOS) or 'floating' (Windows) when creating the overlay BrowserWindow. The overlay must remain above all other application windows at all times — including during screenshot capture, Mission Control activation, app-switcher usage (Cmd+Tab / Alt+Tab), and fullscreen transitions. Verify window position is anchored to the bottom-right corner of the primary display using screen.getPrimaryDisplay().workAreaSize; restore this anchor if a regression is found (see §2). Acceptance: open 5 different applications in sequence; the overlay must remain on top throughout. Take a screenshot — the overlay must remain on top.  |
| **FR-02-P** **Circle Toggle — Open / Close Everything** **\[UPDATED\]** | The circle is a single, stateless toggle: one click opens, the next click closes. No other gesture opens or closes the UI. First click (open): display the prompt bar AND the notification hub simultaneously. Second click (close): hide the prompt bar AND the notification hub simultaneously. The screen shows only the circle. Clicking the circle while the UI is open must close both components in a single interaction — no partial states. Hovering over any part of the overlay (circle, notifications, prompt bar) must NOT open or close either component. Acceptance: click circle → UI opens; click circle again → UI closes completely; only the circle remains.  |
| **FR-03-P** **Fixed-Height Notification Hub** **\[UPDATED\]** | Replace the unbounded notification stack with a fixed-height scrollable container (the 'hub') anchored directly above the circle. The hub height is fixed in pixels (recommended: 360–480 px; exact value TBD with designer). It does not grow beyond this bound regardless of how many notifications exist. Notifications are NOT truncated. Each card renders at its natural height. If all current cards fit within the hub, the hub fills only to that height. A maximum of 3 notifications are visible in the hub viewport simultaneously. If fewer than 3 fit (due to tall cards), show however many fit without cutting any card off. If more than 3 notifications exist, older ones are hidden above the visible viewport. The user can scroll UP inside the hub to reveal them. Scroll behaviour: the hub scrolls only when the cursor is hovering inside it. Scrolling does not affect the rest of the overlay. The most recent notification always appears at the bottom of the hub; older notifications stack upward. Auto-fade (FR-03) applies to the hub as a whole: 3 s after mouse leaves, the entire hub fades to opacity 0\.  |
| **FR-04-P** **Full Notification History on Scroll** **\[UPDATED\]** | Scrolling upward inside the notification hub must reveal ALL past notifications stored in history — not just the 2 currently visible. The hub must render all retained notifications (up to the 50-notification limit from FR-05) as scrollable content, with the oldest at the top. Faded notifications that become visible via scroll must render at their faded opacity (≈30%). Hovering individually unfades them. Scroll position is preserved while the hub is open; it resets to the bottom (most-recent) position each time the hub is re-opened via circle click.  |
| **FR-05-P** **Prompt Bar — Circle-Only Trigger** **\[UPDATED\]** | The prompt bar opens ONLY when the user clicks the circle (FR-02-P toggle). Hovering over notifications, scrolling the hub, or any interaction with notification cards must NOT open the prompt bar. The prompt bar sits below the notification hub and above the circle (base PRD State 2 layout). The prompt bar closes when: (a) the user clicks the circle again, or (b) the user presses Escape. No other interaction closes or opens the prompt bar.  |
| **FR-06-P** **Pixel-Precise Click-Through for Notification Hub** **\[UPDATED\]** | When notifications are visible (opacity \> 0), the notification hub area blocks click-through within the exact rendered bounding rect of each card — clicks on any visible card are captured by Vijia. Clicks in the gaps between cards, outside card bounds, and outside the hub container pass through to the app behind — identical to the pixel-precise circle behaviour already implemented. When ALL notifications have fully faded (opacity \= 0, after ≥3 s mouse-away), the entire hub area reverts to full click-through. This matches the click-through state when no notifications exist. The setIgnoreMouseEvents hit-detection loop (§6 of base PRD) must account for the faded state: if opacity \= 0, exclude hub rects from the active interactive region. Dynamic resizing (FR-01 §6.3) must fire whenever fade state changes, not only when cards are added or removed.  |

# **4  IPC Contract Amendments**

The following additions to the IPC contract are required by the amended requirements above. All existing channels from the base PRD remain unchanged.

| Channel | Direction | Payload | Description |
| :---- | :---- | :---- | :---- |
| **vijia:overlay-toggle** | Renderer → Main | { open: boolean } | Renderer notifies main of the current open/closed state of the overlay UI on each circle click. |
| **vijia:fade-state** | Renderer → Main | { faded: boolean } | Renderer signals when notification hub transitions to/from fully-faded state so main can adjust setIgnoreMouseEvents accordingly. |

# **5  Acceptance Criteria (Patch)**

The following criteria supplement the base AC table. AC-01 through AC-16 from the base PRD remain in force. All criteria below must pass on macOS and/or Windows before the milestone is signed off.

| ID | Test | Acceptance Scenario |
| :---- | :---- | :---- |
| **AC-P01** | **Always-on-top retained** **\[UPDATED\]** | Given any external application gains focus OR a screenshot is taken | then the Vijia overlay remains visible above all windows. Verified by switching to 5 apps sequentially and taking a screenshot. |
| **AC-P02** | **Overlay anchored bottom-right** **\[UPDATED\]** | Given the overlay initialises | then the circle is positioned in the bottom-right corner of the primary display. The overlay must not appear at the top of the screen. |
| **AC-P03** | **Circle toggle — open** **\[UPDATED\]** | Given the UI is closed | when the user clicks the circle | then the prompt bar AND notification hub both appear simultaneously. |
| **AC-P04** | **Circle toggle — close** **\[UPDATED\]** | Given the UI is open | when the user clicks the circle | then the prompt bar AND notification hub both disappear simultaneously. Only the circle remains. |
| **AC-P05** | **Notification hub fixed height** **\[UPDATED\]** | Given more than 3 notifications exist | then the hub does not grow beyond its fixed height. At most 3 (or however many fit without truncation) are visible. No notification card is cut off. |
| **AC-P06** | **Scroll reveals full history** **\[UPDATED\]** | Given 10 notifications have been received | when the user opens the hub and scrolls up | then all 10 are accessible. Only the bottom 3 are visible without scrolling. |
| **AC-P07** | **Prompt bar — hover does not open** **\[UPDATED\]** | Given the UI is closed | when the user hovers over any notification card | then the prompt bar does NOT open. |
| **AC-P08** | **Prompt bar — circle-only trigger** **\[UPDATED\]** | Given the UI is open | when the user interacts with a notification card (hover, scroll) | then the prompt bar visibility does not change. |
| **AC-P09** | **Click-through on faded hub** **\[UPDATED\]** | Given all notifications have faded (3 s mouse-away) | when the user clicks in the hub area | then the click passes through to the application behind Vijia. |
| **AC-P10** | **Click capture on visible cards** **\[UPDATED\]** | Given a notification is visible (opacity \> 0\) | when the user clicks directly on the card | then Vijia captures the click. Clicking in gaps between cards passes through. |
| **AC-P11** | **Dynamic zone — fade transition** **\[NEW\]** | Given notifications transition from visible to fully faded | then the no-click-through zone updates immediately to exclude the hub area without requiring a card add or dismiss. |

# **6  Implementation Notes**

## **6.1  Always-On-Top Level**

Electron exposes a level parameter to BrowserWindow.setAlwaysOnTop(). Use the following platform-specific values:

* macOS: win.setAlwaysOnTop(true, 'screen-saver') — this level sits above the Dock, Mission Control, and screenshot overlays.

* Windows: win.setAlwaysOnTop(true, 'floating') — equivalent Windows API level.

* Verify the level is re-applied after any show() or BrowserWindow state restore; some Electron versions reset the level on hide/show.

## **6.2  Toggle State Management**

Maintain a single boolean isOpen in the React overlay root (Overlay.tsx). The circle's onClick handler flips this flag. Both NotificationHub and PromptBox receive isOpen as a prop and render only when it is true. No other component or event handler may mutate isOpen.

## **6.3  Notification Hub Architecture**

Replace the existing NotificationStack component with a NotificationHub component:

* Outer container: position absolute, fixed height (CSS variable \--hub-height), overflow-y: hidden, anchored above PromptBox.

* Inner scroller: height 100%, overflow-y: auto, display flex, flex-direction column-reverse (most-recent at bottom). Apply overflow-y: scroll only on hover to avoid permanent scrollbar.

* Each NotificationCard renders at its natural height with no max-height or text truncation.

* The hub passes scroll container ref to useHitDetection so bounding rect calculations include the full visible card set.

## **6.4  Fade-State Click-Through**

Add a isFaded boolean to the overlay state, set to true when the auto-fade timer fires (3 s mouse-away) and false on any mouse-enter. The useHitDetection hook must:

* Exclude hub bounding rects from interactive regions when isFaded \=== true.

* Emit vijia:fade-state { faded: true/false } to main process on each transition so setIgnoreMouseEvents is updated immediately — not deferred to the next mousemove event.

# **7  Out of Scope (Unchanged)**

The following remain out of scope from the base PRD and are not affected by this patch:

* Notification persistence across app restarts

* Remote or cloud delivery of notifications

* Custom notification sounds or OS notification centre integration

* Multi-monitor awareness

* UI visual polish — designer will handle colours, typography, and final assets

* Installer or packaged build

# **8  Sign-Off Checklist**

Milestone 2 will be released when all of the following are checked:

|  | Item | Status |
| :---- | :---- | :---- |
| **☐** | AC-01 through AC-16 (base PRD) all pass | Pending |
| **☐** | AC-P01 through AC-P11 (this patch) all pass | Pending |
| **☐** | npx tsc \--noEmit completes with zero errors | Pending |
| **☐** | Overlay anchored to bottom-right corner on both macOS and Windows | Pending |
| **☐** | Circle toggle closes both prompt bar and hub with a single click | Pending |
| **☐** | Notification hub scrolls to reveal full history | Pending |
| **☐** | Prompt bar does not open on notification hover | Pending |
| **☐** | Click-through restored after full fade | Pending |

[image1]: <data:image/png;base64,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>