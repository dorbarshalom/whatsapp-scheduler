# Project: WhatsApp Client Message Scheduler

## 1. Objective

Build a personal Chrome extension that helps me manage client communication
through WhatsApp Web.

I often work late at night and on weekends. I want to compose messages
when convenient and schedule them for the next business morning, without
sending notifications to clients outside working hours.

I am comfortable with product development and technical concepts. Prioritize
a small, maintainable implementation over unnecessary complexity.

This is a personal tool for my own WhatsApp account.

## 2. Core workflow

The primary workflow should be:

1. I open the extension popup.
2. I select a WhatsApp contact or enter a recipient.
3. I compose a message.
4. I select one of these scheduling options:
   - Next business day at 08:00.
   - A specific date and time.
5. The extension saves the message in a persistent local queue.
6. When I open my laptop and WhatsApp Web, the extension identifies
   messages whose scheduled times have arrived.
7. Initially, it presents due messages for review and manual sending.
8. I can confirm sending, postpone, edit, or cancel a message.

The first version must prioritize reliable scheduling and queue management.
Do not implement unattended automatic sending until the scheduling,
recipient validation, and duplicate-prevention behavior have been tested.

## 3. Business calendar and timezone

Use the IANA timezone Asia/Jerusalem.

My normal business days are Sunday through Thursday.

My preferred message delivery time is 08:00.

Scheduling rules:

- A message created outside business hours defaults to the next business
  day at 08:00.
- Friday and Saturday messages default to Sunday at 08:00.
- A message created on a business day before 08:00 defaults to that
  day's 08:00 slot only if that time has not passed.
- A message created at or after 08:00 on a business day defaults to
  the next business day at 08:00.
- If the current time is exactly 08:00, treat the 08:00 slot as available
  only if the application can still reasonably deliver the message then;
  otherwise select the next business day.
- Never silently move a message to an earlier scheduled time.
- Allow the user to override the default with a custom date and time.

Store timestamps in a consistent format and calculate business dates
using Asia/Jerusalem rather than relying on the computer's timezone.

Account for daylight-saving-time changes.

For the initial version, do not implement public holidays. Document that
the business calendar covers weekdays only, not Israeli holidays.

## 4. User interface

Create a clean, minimal interface.

### A. Compose message

Fields:

- Recipient
- Message text
- Scheduling option
- Scheduled date and time

Actions:

- Schedule message
- Save as draft
- Cancel

Display the calculated delivery time before saving.

### B. Scheduled queue

Display messages sorted by scheduled time.

Each message should show:

- Recipient
- Message preview
- Scheduled date and time
- Status

Available actions:

- Edit
- Reschedule
- Cancel
- Delete draft

### C. Due messages

When WhatsApp Web is available and messages are overdue, show a clear
notification or queue section.

For each due message, display:

- Intended recipient
- Full message text
- Original scheduled time
- Current status

Actions:

- Open the intended conversation
- Mark as ready to send
- Postpone
- Cancel

For the initial version, I must manually review and send messages.

Do not mark a message as sent simply because the WhatsApp conversation
opened or the message was placed in the composer.

### D. History

Provide a basic history of messages with these statuses:

- Draft
- Scheduled
- Due
- Ready for review
- Sent
- Cancelled
- Failed

Distinguish confirmed delivery to WhatsApp from successful delivery
to the recipient. Do not claim recipient delivery unless that status
is actually available and verified.

## 5. Technical architecture

Use Chrome Extension Manifest V3.

Prefer:

- JavaScript or TypeScript.
- A lightweight HTML/CSS interface, or a small framework only if justified.
- chrome.storage.local for persistent local data.
- chrome.alarms for periodic checks when the extension is active.
- A content script for integration with WhatsApp Web, if needed.

Do not introduce a backend, database server, paid service, or external
messaging API in the initial version.

Important Chrome extension constraints:

- Extension service workers can stop and restart.
- Do not rely on setTimeout or setInterval as persistent schedulers.
- Recalculate overdue messages when the extension starts and when
  relevant browser events occur.
- Use persistent storage as the source of truth.
- Treat alarms as wake-up mechanisms, not as guaranteed delivery timers.
- Handle missing permissions and unavailable WhatsApp Web gracefully.

The extension must not require a permanently running background process.

## 6. WhatsApp integration

The first version must work with WhatsApp Web.

Before implementing integration, investigate the current WhatsApp Web
interface and determine the least fragile approach.

Do not assume WhatsApp's internal DOM selectors or undocumented APIs
are stable.

Requirements:

- Identify the active conversation and recipient as reliably as possible.
- Validate that the open conversation matches the intended recipient.
- Never send if the recipient cannot be verified.
- Never send automatically to whichever conversation happens to be open.
- Do not use undocumented WhatsApp network endpoints.
- Do not automate login or attempt to bypass WhatsApp security.
- Do not send messages through a different account than the one
  the user has authenticated.

Initially, opening a conversation and preparing a message for manual
review is acceptable.

If reliable recipient identification cannot be implemented safely,
stop and document the limitation rather than inventing a solution.

## 7. Data model

Define a clear schema for scheduled messages.

Each message should include:

- A unique ID
- Recipient display name
- Recipient identifier, if reliably available
- Message text
- Creation timestamp
- Scheduled timestamp
- Timezone
- Status
- Last updated timestamp
- Sent timestamp, if sending is confirmed
- Error details, if applicable
- A delivery attempt identifier or equivalent duplicate-prevention data

Use schema versioning so future versions can migrate stored data safely.

Validate all stored records before processing them.

## 8. Reliability and duplicate prevention

Prevent duplicate messages caused by:

- Browser refreshes
- Extension restarts
- Multiple open WhatsApp Web tabs
- Repeated clicks
- Retried operations

Use an explicit state transition before initiating any send operation.

Never automatically retry a send when the outcome is ambiguous.
Instead, flag it for manual review.

Explain the limits of exactly-once delivery when the application cannot
reliably determine whether WhatsApp accepted a message.

Do not delete a scheduled message until its cancellation is confirmed
in local state.

## 9. Security and privacy

This extension handles confidential client communications.

Requirements:

- Keep message content in local extension storage.
- Do not send message content to external servers.
- Do not add analytics or telemetry.
- Do not log message bodies to the console.
- Request only the minimum permissions needed.
- Restrict content-script access to WhatsApp Web.
- Explain what data is stored locally and how to delete it.
- Avoid unnecessary access to browsing history or unrelated websites.

Before using any external library, explain why it is needed.

## 10. Development stages

Work in small, testable stages.

Stage 1: Project setup
- Create the extension structure.
- Configure Manifest V3.
- Implement a basic popup.
- Verify that the extension loads in Chrome.

Stage 2: Scheduling logic
- Implement next-business-day calculation.
- Implement Asia/Jerusalem timezone handling.
- Add tests for Sunday through Saturday.
- Test dates around midnight and 08:00.
- Test daylight-saving-time transitions.

Stage 3: Local persistence
- Implement drafts and scheduled messages.
- Add editing, rescheduling, and cancellation.
- Test persistence across browser restarts.

Stage 4: Queue interface
- Display upcoming and overdue messages.
- Implement message status transitions.
- Add a basic history view.

Stage 5: WhatsApp Web integration
- Detect WhatsApp Web availability.
- Investigate safe recipient identification.
- Implement conversation opening and manual review.
- Never send when the recipient is ambiguous.

Stage 6: Reliability
- Test refreshes, multiple tabs, interrupted sessions, and repeated clicks.
- Verify that messages are not silently lost or duplicated.
- Document known limitations.

Do not proceed to the next stage until the current stage passes its tests.

## 11. Acceptance criteria

The implementation is acceptable when:

1. I can schedule a message for the next business day at 08:00.
2. Saturday-night messages are assigned to Sunday at 08:00.
3. Messages persist across browser restarts.
4. Overdue messages are shown when I reopen the extension.
5. I can edit, postpone, or cancel a scheduled message.
6. The extension does not claim to send messages while the computer
   is turned off.
7. The extension never sends a message to an unverified recipient.
8. Ambiguous sending outcomes are flagged for manual review.
9. The scheduling logic passes automated tests.
10. The extension can be installed locally in Chrome using
    the documented developer-mode workflow.

## 12. How you should work

First inspect the existing project directory.

If it is empty, create the project from scratch.

Before writing code:

1. Propose a minimal file structure.
2. Explain the architecture and its limitations.
3. Identify any technical assumptions that require verification.
4. Describe the test strategy.

Then implement Stage 1 only.

Run the available tests and explain how I can load and test the extension.

Do not generate the entire project in one unverified step.
Do not introduce unnecessary abstractions or dependencies.

At the end of each stage, summarize:
- What was implemented
- What was tested
- What passed or failed
- What remains to be done