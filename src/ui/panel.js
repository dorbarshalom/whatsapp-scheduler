/**
 * WhatsApp Scheduler - Side Panel Controller
 * Handles compose, persistence, queue rendering, due review, drafts,
 * drag-and-drop file attachments, and auto-sending toggle.
 */

import { TIMEZONE, MESSAGE_STATUS, ATTACHMENT_CONFIG } from '../core/types.js';
import {
  getNextBusinessSlot,
  formatJerusalemDateTime,
  isValidCustomSchedule,
  isScheduledTimeDue
} from '../core/calendar.js';
import {
  getMessages,
  saveMessage,
  updateMessageStatus,
  deleteMessage,
  getDraft,
  saveDraft,
  clearDraft,
  normalizePhoneNumber,
  checkAndTransitionDueMessages,
  getSettings,
  saveSettings,
  getContacts,
  saveContact,
  deleteContact
} from '../core/storage.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabViews = document.querySelectorAll('.tab-view');
  const composeForm = document.getElementById('compose-form');
  const contactSelect = document.getElementById('contact-select');
  const btnDeleteContact = document.getElementById('btn-delete-contact');
  const btnSaveContact = document.getElementById('btn-save-contact');
  const recipientPhoneInput = document.getElementById('recipient-phone');
  const recipientNameInput = document.getElementById('recipient-name');
  const messageInput = document.getElementById('message-text');
  const charCounter = document.getElementById('char-counter');
  const customScheduleToggle = document.getElementById('custom-schedule-toggle');
  const customDatetimeContainer = document.getElementById('custom-datetime-container');
  const customDatetimeInput = document.getElementById('custom-datetime');
  const previewTimestamp = document.getElementById('preview-timestamp');
  const btnSaveDraft = document.getElementById('btn-save-draft');
  const btnClear = document.getElementById('btn-clear');
  const queueList = document.getElementById('queue-list');
  const dueList = document.getElementById('due-list');
  const historyList = document.getElementById('history-list');
  const badgeQueue = document.getElementById('badge-queue');
  const badgeDue = document.getElementById('badge-due');

  // Drag-and-drop attachments & auto-send toggle elements
  const fileDropZone = document.getElementById('file-drop-zone');
  const fileInput = document.getElementById('file-input');
  const attachmentsPreviewList = document.getElementById('attachments-preview-list');
  const autoSendToggle = document.getElementById('auto-send-toggle');

  // State
  let editingMessageId = null;
  let currentActiveTab = 'compose';
  let currentAttachments = [];

  // Contacts Management (Dropdown, save once, auto-fill, delete)
  async function loadContacts(selectedIdToKeep = null) {
    if (!contactSelect) return;
    let contacts = await getContacts();

    // Auto-seed from existing messages if contacts list is currently empty
    if (contacts.length === 0) {
      const messages = await getMessages();
      const seenPhones = new Set();
      for (const msg of messages) {
        if (msg.recipient?.phone && !seenPhones.has(msg.recipient.phone)) {
          seenPhones.add(msg.recipient.phone);
          await saveContact({
            name: msg.recipient.name || '',
            phone: msg.recipient.phone
          });
        }
      }
      if (seenPhones.size > 0) {
        contacts = await getContacts();
      }
    }

    const currentVal = selectedIdToKeep || contactSelect.value;
    contactSelect.innerHTML = '<option value="">— Choose a saved contact —</option>' +
      contacts.map((c) => {
        const label = c.name ? `${escapeHtml(c.name)} (${escapeHtml(c.phone)})` : escapeHtml(c.phone);
        return `<option value="${escapeHtml(c.id)}" data-phone="${escapeHtml(c.phone)}" data-name="${escapeHtml(c.name || '')}">${label}</option>`;
      }).join('');

    if (currentVal && contacts.some((c) => c.id === currentVal)) {
      contactSelect.value = currentVal;
      if (btnDeleteContact) btnDeleteContact.hidden = false;
    } else {
      if (btnDeleteContact) btnDeleteContact.hidden = true;
    }
  }

  contactSelect?.addEventListener('change', () => {
    const selectedOpt = contactSelect.options[contactSelect.selectedIndex];
    if (contactSelect.value && selectedOpt) {
      recipientPhoneInput.value = selectedOpt.dataset.phone || '';
      recipientNameInput.value = selectedOpt.dataset.name || '';
      if (btnDeleteContact) btnDeleteContact.hidden = false;
    } else {
      if (btnDeleteContact) btnDeleteContact.hidden = true;
    }
  });

  btnDeleteContact?.addEventListener('click', async () => {
    const selectedId = contactSelect.value;
    if (!selectedId) return;
    if (confirm('Remove this contact from your saved contacts?')) {
      await deleteContact(selectedId);
      contactSelect.value = '';
      if (btnDeleteContact) btnDeleteContact.hidden = true;
      await loadContacts();
    }
  });

  btnSaveContact?.addEventListener('click', async () => {
    const phone = recipientPhoneInput.value.trim();
    const name = recipientNameInput.value.trim();

    if (!phone) {
      alert('Please enter a recipient phone number first.');
      recipientPhoneInput.focus();
      return;
    }

    try {
      const saved = await saveContact({ name, phone });
      await loadContacts(saved.id);
      const originalText = btnSaveContact.textContent;
      btnSaveContact.textContent = 'Saved ✓';
      setTimeout(() => {
        btnSaveContact.textContent = originalText;
      }, 1500);
    } catch (err) {
      alert(`Error saving contact: ${err.message}`);
    }
  });

  // Auto-send Toggle Setup (Located at top of Due tab)
  getSettings().then((settings) => {
    if (autoSendToggle) {
      autoSendToggle.checked = Boolean(settings.autoSendDefault);
    }
  });

  autoSendToggle?.addEventListener('change', async () => {
    await saveSettings({ autoSendDefault: autoSendToggle.checked });
  });

  // 1. Navigation / Tab Switching
  function switchTab(targetTabId) {
    currentActiveTab = targetTabId;
    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.tab === targetTabId;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    tabViews.forEach((view) => {
      const isTarget = view.id === `view-${targetTabId}`;
      view.classList.toggle('active', isTarget);
      view.hidden = !isTarget;
    });

    // Refresh views on tab change
    if (targetTabId === 'queue') renderQueue();
    if (targetTabId === 'due') renderDue();
    if (targetTabId === 'history') renderHistory();
  }

  async function refreshActiveView() {
    await updateBadges();
    if (currentActiveTab === 'queue') await renderQueue();
    if (currentActiveTab === 'due') await renderDue();
    if (currentActiveTab === 'history') await renderHistory();
  }

  // Periodic heartbeat every 10s to transition overdue items while panel is open
  setInterval(refreshActiveView, 10000);

  // Refresh immediately when window gains focus or tab becomes visible
  window.addEventListener('focus', refreshActiveView);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshActiveView();
  });

  // Listen to chrome.storage changes from background worker
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes['wa_scheduler_messages']) {
        refreshActiveView();
      }
    });
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('[data-switch-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.switchTab));
  });

  // 2. Character counter
  if (messageInput && charCounter) {
    messageInput.addEventListener('input', () => {
      const count = messageInput.value.length;
      charCounter.textContent = `${count} char${count === 1 ? '' : 's'}`;
    });
  }

  // 3. Scheduling options: Next business morning is assumed by default; custom toggle available
  customScheduleToggle?.addEventListener('change', () => {
    const isCustom = customScheduleToggle.checked;
    if (customDatetimeContainer) {
      customDatetimeContainer.hidden = !isCustom;
    }
    updatePreview();
  });

  // 4. Live delivery preview calculation
  function calculateTargetDate() {
    if (!customScheduleToggle?.checked) {
      return getNextBusinessSlot();
    }
    const customVal = customDatetimeInput?.value;
    if (!customVal) return null;
    return new Date(customVal);
  }

  function updatePreview() {
    if (!customScheduleToggle?.checked) {
      const nextSlot = getNextBusinessSlot();
      previewTimestamp.textContent = `${formatJerusalemDateTime(nextSlot)} (Next Business Morning)`;
    } else {
      const customVal = customDatetimeInput?.value;
      if (!customVal) {
        previewTimestamp.textContent = 'Select custom date & time above';
      } else {
        const validation = isValidCustomSchedule(customVal);
        if (validation.valid) {
          previewTimestamp.textContent = formatJerusalemDateTime(new Date(customVal));
        } else {
          previewTimestamp.textContent = `⚠️ ${validation.error}`;
        }
      }
    }
  }

  customDatetimeInput?.addEventListener('input', updatePreview);

  // 5. Drag & Drop File Attachments
  function formatFileSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function processFiles(fileList) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    let currentTotal = currentAttachments.reduce((acc, f) => acc + (f.size || 0), 0);

    for (const file of files) {
      if (file.size > ATTACHMENT_CONFIG.MAX_FILE_SIZE_BYTES) {
        alert(`File "${file.name}" exceeds the maximum limit of ${ATTACHMENT_CONFIG.MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
        continue;
      }
      if (currentTotal + file.size > ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_BYTES) {
        alert(`Total attachments exceed the maximum limit of ${ATTACHMENT_CONFIG.MAX_TOTAL_SIZE_BYTES / (1024 * 1024)}MB.`);
        break;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        currentAttachments.push({
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          dataUrl
        });
        currentTotal += file.size;
      } catch (err) {
        console.error('Failed to read file:', file.name, err);
        alert(`Failed to attach ${file.name}`);
      }
    }
    renderAttachmentChips();
  }

  function renderAttachmentChips() {
    if (!attachmentsPreviewList) return;
    if (currentAttachments.length === 0) {
      attachmentsPreviewList.hidden = true;
      attachmentsPreviewList.innerHTML = '';
      return;
    }

    attachmentsPreviewList.hidden = false;
    attachmentsPreviewList.innerHTML = currentAttachments
      .map((att, idx) => {
        const isImg = att.type && att.type.startsWith('image/');
        const thumbHtml = isImg
          ? `<img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" class="chip-thumb" />`
          : `<div class="chip-file-icon">📄</div>`;

        return `
          <div class="attachment-chip" data-id="${att.id}">
            ${thumbHtml}
            <div class="chip-meta">
              <span class="chip-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
              <span class="chip-size">${formatFileSize(att.size)}</span>
            </div>
            <button type="button" class="chip-remove-btn" data-index="${idx}" title="Remove file" aria-label="Remove ${escapeHtml(att.name)}">✕</button>
          </div>
        `;
      })
      .join('');

    attachmentsPreviewList.querySelectorAll('.chip-remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        currentAttachments.splice(idx, 1);
        renderAttachmentChips();
      });
    });
  }

  if (fileDropZone && fileInput) {
    fileDropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover'].forEach((eventName) => {
      fileDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropZone.classList.add('drag-active');
      });
    });

    ['dragleave', 'dragend'].forEach((eventName) => {
      fileDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        fileDropZone.classList.remove('drag-active');
      });
    });

    fileDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fileDropZone.classList.remove('drag-active');
      if (e.dataTransfer && e.dataTransfer.files) {
        processFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files) {
        processFiles(e.target.files);
        fileInput.value = ''; // Reset so the same file can be re-selected if removed
      }
    });

    // Also support drag & drop anywhere on compose view
    const composeView = document.getElementById('view-compose');
    if (composeView) {
      composeView.addEventListener('dragover', (e) => e.preventDefault());
      composeView.addEventListener('drop', (e) => {
        if (e.target.closest('#file-drop-zone')) return;
        e.preventDefault();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
        }
      });
    }
  }

  // 6. Compose Form Submission (Save & Schedule)
  composeForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = recipientPhoneInput.value.trim();
    const name = recipientNameInput.value.trim();
    const text = messageInput.value.trim();
    const hasAttachments = currentAttachments.length > 0;

    if (!phone) {
      alert('Please enter a recipient phone number.');
      recipientPhoneInput.focus();
      return;
    }

    if (!text && !hasAttachments) {
      alert('Please enter a message text or attach at least one file.');
      messageInput.focus();
      return;
    }

    const scheduledDate = calculateTargetDate();
    if (!scheduledDate || isNaN(scheduledDate.getTime())) {
      alert('Please select a valid future delivery time.');
      return;
    }

    if (customScheduleToggle?.checked) {
      const validation = isValidCustomSchedule(scheduledDate);
      if (!validation.valid) {
        alert(`Invalid schedule: ${validation.error}`);
        return;
      }
    }

    try {
      await saveMessage({
        id: editingMessageId || undefined,
        recipient: { name, phone },
        text,
        attachments: currentAttachments,
        autoSend: autoSendToggle?.checked || false,
        scheduledFor: scheduledDate.toISOString(),
        status: MESSAGE_STATUS.SCHEDULED
      });

      // Auto-save or update contact for future convenience
      await saveContact({ name, phone });
      await loadContacts();

      // Reset form and draft
      editingMessageId = null;
      composeForm.reset();
      currentAttachments = [];
      renderAttachmentChips();
      if (customScheduleToggle) customScheduleToggle.checked = false;
      if (customDatetimeContainer) customDatetimeContainer.hidden = true;
      if (contactSelect) contactSelect.value = '';
      if (btnDeleteContact) btnDeleteContact.hidden = true;
      updatePreview();
      await clearDraft();
      if (charCounter) charCounter.textContent = '0 chars';

      // Update badge counts and switch to queue
      await updateBadges();
      switchTab('queue');
    } catch (err) {
      alert(`Error scheduling message: ${err.message}`);
    }
  });

  // 7. Drafts (Save & Restore)
  btnSaveDraft?.addEventListener('click', async () => {
    const draft = {
      phone: recipientPhoneInput.value,
      name: recipientNameInput.value,
      text: messageInput.value,
      attachments: currentAttachments,
      isCustomSchedule: customScheduleToggle?.checked || false,
      customDatetime: customDatetimeInput?.value || ''
    };
    await saveDraft(draft);
    alert('Draft saved locally with attachments and settings.');
  });

  btnClear?.addEventListener('click', async () => {
    if (confirm('Clear the current composer?')) {
      editingMessageId = null;
      composeForm.reset();
      currentAttachments = [];
      renderAttachmentChips();
      if (customScheduleToggle) customScheduleToggle.checked = false;
      if (customDatetimeContainer) customDatetimeContainer.hidden = true;
      if (contactSelect) contactSelect.value = '';
      if (btnDeleteContact) btnDeleteContact.hidden = true;
      updatePreview();
      await clearDraft();
      if (charCounter) charCounter.textContent = '0 chars';
    }
  });

  async function loadDraftIfExists() {
    const draft = await getDraft();
    if (draft && !editingMessageId) {
      if (draft.phone) recipientPhoneInput.value = draft.phone;
      if (draft.name) recipientNameInput.value = draft.name;
      if (draft.text) {
        messageInput.value = draft.text;
        if (charCounter) charCounter.textContent = `${draft.text.length} chars`;
      }
      if (Array.isArray(draft.attachments) && draft.attachments.length > 0) {
        currentAttachments = draft.attachments;
        renderAttachmentChips();
      }
      const isCustom = Boolean(draft.isCustomSchedule || draft.scheduleOption === 'custom');
      if (customScheduleToggle) {
        customScheduleToggle.checked = isCustom;
      }
      if (customDatetimeContainer) {
        customDatetimeContainer.hidden = !isCustom;
        if (draft.customDatetime && customDatetimeInput) {
          customDatetimeInput.value = draft.customDatetime;
        }
      }
      updatePreview();
    }
  }

  // 8. Render Helpers for Attachments
  function renderCardAttachmentsHtml(attachments, allowDownload = false) {
    if (!attachments || !Array.isArray(attachments) || attachments.length === 0) return '';
    const items = attachments
      .map((att) => {
        const isImg = att.type && att.type.startsWith('image/');
        const thumb = isImg && att.dataUrl
          ? `<img src="${att.dataUrl}" alt="${escapeHtml(att.name)}" />`
          : `📎`;
        if (allowDownload && att.dataUrl) {
          return `
            <a href="${att.dataUrl}" download="${escapeHtml(att.name)}" class="card-attach-pill" title="Click to download ${escapeHtml(att.name)}">
              ${thumb}
              <span>${escapeHtml(att.name)}</span>
            </a>
          `;
        }
        return `
          <span class="card-attach-pill">
            ${thumb}
            <span>${escapeHtml(att.name)}</span>
          </span>
        `;
      })
      .join('');

    return `<div class="card-attachments">${items}</div>`;
  }

  // 9. Render Views
  async function updateBadges() {
    await checkAndTransitionDueMessages();
    const scheduled = await getMessages({ status: MESSAGE_STATUS.SCHEDULED });
    const due = await getMessages({ status: MESSAGE_STATUS.DUE });

    if (badgeQueue) {
      badgeQueue.textContent = scheduled.length;
      badgeQueue.hidden = scheduled.length === 0;
    }
    if (badgeDue) {
      badgeDue.textContent = due.length;
      badgeDue.hidden = due.length === 0;
    }
  }

  async function renderQueue() {
    await updateBadges();
    const messages = await getMessages({ status: MESSAGE_STATUS.SCHEDULED });

    if (messages.length === 0) {
      queueList.innerHTML = `
        <div class="empty-state">
          <p>No scheduled messages in the queue.</p>
          <button class="btn btn-sm btn-secondary" data-switch-tab="compose">Compose a Message</button>
        </div>
      `;
      queueList.querySelector('[data-switch-tab]')?.addEventListener('click', () => switchTab('compose'));
      return;
    }

    queueList.innerHTML = messages
      .map((msg) => {
        const displayName = msg.recipient.name
          ? `${escapeHtml(msg.recipient.name)} <span class="recipient-phone">(${escapeHtml(msg.recipient.phone)})</span>`
          : escapeHtml(msg.recipient.phone);

        const scheduledStr = formatJerusalemDateTime(new Date(msg.scheduledFor));
        const autoSendBadge = msg.autoSend ? `<span class="badge-auto" title="Scheduled to auto-dispatch">⚡ Auto-send</span>` : '';
        const attachmentsHtml = renderCardAttachmentsHtml(msg.attachments, false);

        return `
          <div class="message-card" data-id="${msg.id}">
            <div class="card-header">
              <span class="card-recipient">${displayName}</span>
              <div style="display:flex; align-items:center; gap:6px;">
                ${autoSendBadge}
                <span class="status-pill status-scheduled">Scheduled</span>
              </div>
            </div>
            ${msg.text ? `<div class="card-body"><p class="card-text">${escapeHtml(msg.text)}</p></div>` : ''}
            ${attachmentsHtml}
            <div class="card-meta">
              <span class="meta-slot">🕒 ${scheduledStr}</span>
            </div>
            <div class="card-actions">
              <button class="btn btn-sm btn-secondary btn-edit" data-id="${msg.id}">Edit</button>
              <button class="btn btn-sm btn-secondary btn-reschedule" data-id="${msg.id}">Reschedule (+1 Day)</button>
              <button class="btn btn-sm btn-ghost btn-cancel" data-id="${msg.id}">Cancel</button>
            </div>
          </div>
        `;
      })
      .join('');

    // Wire Card Actions
    queueList.querySelectorAll('.btn-edit').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const msg = (await getMessages()).find((m) => m.id === id);
        if (msg) {
          editingMessageId = msg.id;
          recipientPhoneInput.value = msg.recipient.phone;
          recipientNameInput.value = msg.recipient.name;
          messageInput.value = msg.text || '';
          currentAttachments = Array.isArray(msg.attachments) ? [...msg.attachments] : [];
          renderAttachmentChips();
          if (charCounter) charCounter.textContent = `${(msg.text || '').length} chars`;

          // Select matching contact in dropdown if available
          const contacts = await getContacts();
          const match = contacts.find((c) => c.phone === msg.recipient.phone);
          if (match && contactSelect) {
            contactSelect.value = match.id;
            if (btnDeleteContact) btnDeleteContact.hidden = false;
          } else if (contactSelect) {
            contactSelect.value = '';
            if (btnDeleteContact) btnDeleteContact.hidden = true;
          }

          // Handle custom vs next business morning schedule
          const nextSlot = getNextBusinessSlot();
          const msgDate = new Date(msg.scheduledFor);
          const isCustom = Math.abs(msgDate.getTime() - nextSlot.getTime()) > 60000;
          if (customScheduleToggle) customScheduleToggle.checked = isCustom;
          if (customDatetimeContainer) customDatetimeContainer.hidden = !isCustom;
          if (isCustom && customDatetimeInput) {
            const localIso = new Date(msgDate.getTime() - msgDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
            customDatetimeInput.value = localIso;
          }
          updatePreview();

          switchTab('compose');
        }
      });
    });

    queueList.querySelectorAll('.btn-reschedule').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const msg = (await getMessages()).find((m) => m.id === id);
        if (msg) {
          const currentDate = new Date(msg.scheduledFor);
          const nextSlot = getNextBusinessSlot(new Date(currentDate.getTime() + 60 * 1000));
          await saveMessage({
            ...msg,
            scheduledFor: nextSlot.toISOString()
          });
          renderQueue();
        }
      });
    });

    queueList.querySelectorAll('.btn-cancel').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        if (confirm('Cancel this scheduled message?')) {
          await updateMessageStatus(id, MESSAGE_STATUS.CANCELLED);
          renderQueue();
        }
      });
    });
  }

  async function renderDue() {
    await updateBadges();
    const dueMessages = await getMessages({ status: MESSAGE_STATUS.DUE });

    if (dueMessages.length === 0) {
      dueList.innerHTML = `
        <div class="empty-state">
          <p>No messages currently overdue for delivery.</p>
        </div>
      `;
      return;
    }

    dueList.innerHTML = dueMessages
      .map((msg) => {
        const displayName = msg.recipient.name
          ? `${escapeHtml(msg.recipient.name)} (${escapeHtml(msg.recipient.phone)})`
          : escapeHtml(msg.recipient.phone);

        const autoSendBadge = msg.autoSend ? `<span class="badge-auto" title="Scheduled to auto-dispatch">⚡ Auto-send</span>` : '';
        const attachmentsHtml = renderCardAttachmentsHtml(msg.attachments, true);

        return `
          <div class="message-card due-card" data-id="${msg.id}">
            <div class="card-header">
              <span class="card-recipient">${displayName}</span>
              <div style="display:flex; align-items:center; gap:6px;">
                ${autoSendBadge}
                <span class="status-pill status-due">Due for Review</span>
              </div>
            </div>
            ${msg.text ? `<div class="card-body"><p class="card-text">${escapeHtml(msg.text)}</p></div>` : ''}
            ${attachmentsHtml}
            <div class="card-actions">
              <button class="btn btn-sm btn-primary btn-open-wa" data-id="${msg.id}" data-phone="${escapeHtml(msg.recipient.phone)}" data-text="${encodeURIComponent(msg.text || '')}">Open in WhatsApp Web</button>
              <button class="btn btn-sm btn-secondary btn-mark-sent" data-id="${msg.id}">Mark as Sent</button>
              <button class="btn btn-sm btn-ghost btn-cancel" data-id="${msg.id}">Cancel</button>
            </div>
          </div>
        `;
      })
      .join('');

    dueList.querySelectorAll('.btn-open-wa').forEach((btn) => {
      btn.addEventListener('click', () => {
        const phone = btn.dataset.phone.replace(/[^0-9]/g, '');
        const text = btn.dataset.text;
        const waUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${text}`;
        window.open(waUrl, '_blank');
      });
    });

    dueList.querySelectorAll('.btn-mark-sent').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await updateMessageStatus(btn.dataset.id, MESSAGE_STATUS.SENT);
        renderDue();
      });
    });

    dueList.querySelectorAll('.btn-cancel').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await updateMessageStatus(btn.dataset.id, MESSAGE_STATUS.CANCELLED);
        renderDue();
      });
    });
  }

  async function renderHistory() {
    const all = await getMessages();
    const history = all.filter((m) => [MESSAGE_STATUS.SENT, MESSAGE_STATUS.CANCELLED].includes(m.status));

    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <p>No history records available yet.</p>
        </div>
      `;
      return;
    }

    historyList.innerHTML = history
      .map((msg) => {
        const isSent = msg.status === MESSAGE_STATUS.SENT;
        const pillClass = isSent ? 'status-sent' : 'status-cancelled';
        const label = isSent ? 'Sent' : 'Cancelled';
        const autoSendBadge = msg.autoSend ? `<span class="badge-auto">⚡ Auto</span>` : '';
        const attachmentsHtml = renderCardAttachmentsHtml(msg.attachments, true);

        return `
          <div class="message-card">
            <div class="card-header">
              <span class="card-recipient">${escapeHtml(msg.recipient.name || msg.recipient.phone)}</span>
              <div style="display:flex; align-items:center; gap:6px;">
                ${autoSendBadge}
                <span class="status-pill ${pillClass}">${label}</span>
              </div>
            </div>
            ${msg.text ? `<div class="card-body"><p class="card-text">${escapeHtml(msg.text)}</p></div>` : ''}
            ${attachmentsHtml}
            <div class="card-meta">
              <span>Last updated: ${new Date(msg.lastUpdatedAt).toLocaleString()}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initialize
  await loadContacts();
  updatePreview();
  await loadDraftIfExists();
  await updateBadges();
});
