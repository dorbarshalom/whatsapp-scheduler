# WhatsApp Scheduler (Chrome Extension)

A personal Chrome Extension (Manifest V3) for WhatsApp Web that allows you to compose messages anytime (late at night or over weekends) and schedule them for delivery during business hours (default: next business morning at 08:00, Asia/Jerusalem calendar) or at a custom date & time.

---

## 🚀 How to Install in Google Chrome

Follow these steps to load the extension as an unpacked developer extension:

### 1. Prerequisites
- Google Chrome browser (v114+ recommended for Side Panel API support).
- Node.js (v18+ recommended) if you wish to run unit tests.

### 2. Load Unpacked Extension
1. Open Google Chrome and enter `chrome://extensions` in the address bar (or go to **Settings > Extensions**).
2. In the top right corner of the Extensions page, switch the **Developer mode** toggle to **ON**.
3. In the top left corner, click the **Load unpacked** button.
4. In the file picker, select the **root directory of this project** (the folder containing `manifest.json`).
5. **WhatsApp Scheduler** will now appear in your list of installed extensions.

### 3. Pin to Toolbar (Recommended)
1. Click the **Extensions puzzle icon** (🧩) in the top right of your Chrome toolbar.
2. Find **WhatsApp Scheduler** in the list and click the **Pin** icon (📌) so it stays easily accessible.

---

## 💡 How to Use

1. **Open WhatsApp Web**: Go to [https://web.whatsapp.com](https://web.whatsapp.com) and log in.
2. **Open the Scheduler Side Panel**: Click the **WhatsApp Scheduler** icon on your Chrome toolbar. The extension opens inside the Chrome **Side Panel** alongside WhatsApp Web.
3. **Compose & Schedule**:
   - **Recipient**: Enter phone number or contact identifier.
   - **Message**: Type your message.
   - **Scheduled Time**:
     - *Next Business Morning (Default)*: Sunday – Thursday at 08:00 (Asia/Jerusalem timezone).
     - *Custom Date & Time*: Choose any specific date and time.
4. **Queue & Send**:
   - Scheduled messages are saved securely in your browser's local storage.
   - When a scheduled time arrives and WhatsApp Web is open, the message will appear under **Due Messages**.
   - Review and trigger delivery directly into WhatsApp Web.

---

## 🔄 Making Changes & Reloading

Whenever you make changes to HTML, CSS, or JavaScript files:
1. Return to `chrome://extensions`.
2. Find **WhatsApp Scheduler**.
3. Click the **Reload** (circular arrow) icon on the extension's card.
4. If you modified the Side Panel UI, close and reopen the side panel in your WhatsApp tab.

---

## 🧪 Running Tests

The project includes unit tests for calendar rules (business day calculations, Israel timezone) and local storage queue management.

Run tests using Node's built-in test runner:

```bash
npm test
```

---

## 📁 Project Structure

```
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── package.json               # Node metadata and test script
├── spec.md                    # Project requirements and calendar specification
├── src/
│   ├── background/
│   │   └── service-worker.js  # Service worker handling alarms & side panel setup
│   ├── core/
│   │   ├── calendar.js        # Business hours, weekends, and holiday scheduling logic
│   │   ├── storage.js         # Chrome storage wrapper for message queue
│   │   └── types.js           # Data structures and message status definitions
│   ├── ui/
│   │   ├── panel.html         # Side panel UI layout
│   │   ├── panel.css          # Modern dark/light styling
│   │   └── panel.js           # Side panel UI controller and event bindings
│   └── icons/                 # Extension toolbar and web store icons
└── tests/                     # Unit tests for storage and calendar logic
```
