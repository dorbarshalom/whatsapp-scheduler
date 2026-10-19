import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhoneNumber,
  saveMessage,
  getMessages,
  updateMessageStatus,
  deleteMessage,
  saveDraft,
  getDraft,
  clearDraft,
  checkAndTransitionDueMessages,
  getContacts,
  saveContact,
  deleteContact
} from '../src/core/storage.js';
import { MESSAGE_STATUS, CURRENT_SCHEMA_VERSION } from '../src/core/types.js';

test('Storage: normalizePhoneNumber handles local Israeli and international numbers', () => {
  // Local Israeli mobile with dashes/spaces
  assert.equal(normalizePhoneNumber('050-123-4567'), '+972501234567');
  assert.equal(normalizePhoneNumber('052 987 6543'), '+972529876543');

  // Already has +
  assert.equal(normalizePhoneNumber('+972501112233'), '+972501112233');
  assert.equal(normalizePhoneNumber('+1 (555) 234-5678'), '+15552345678');

  // Double zero prefix
  assert.equal(normalizePhoneNumber('00972541234567'), '+972541234567');
});

test('Storage: saveMessage stores valid record and normalizes recipient phone', async () => {
  const saved = await saveMessage({
    recipient: { name: 'Avi Cohen', phone: '050-111-2233' },
    text: 'Shalom Avi, see you tomorrow morning.',
    scheduledFor: '2026-10-20T06:00:00.000Z'
  });

  assert.ok(saved.id);
  assert.equal(saved.recipient.name, 'Avi Cohen');
  assert.equal(saved.recipient.phone, '+972501112233');
  assert.equal(saved.status, MESSAGE_STATUS.SCHEDULED);
  assert.equal(saved.schemaVersion, CURRENT_SCHEMA_VERSION);
  assert.ok(saved.createdAt);
  assert.ok(saved.lastUpdatedAt);
});

test('Storage: getMessages retrieves records and filters by status', async () => {
  const all = await getMessages();
  assert.ok(all.length >= 1);

  const scheduled = await getMessages({ status: MESSAGE_STATUS.SCHEDULED });
  assert.ok(scheduled.every((m) => m.status === MESSAGE_STATUS.SCHEDULED));
});

test('Storage: updateMessageStatus updates status and records sent timestamp', async () => {
  const msg = await saveMessage({
    recipient: { phone: '+972540001122' },
    text: 'Test status transitions',
    scheduledFor: '2026-10-20T06:00:00.000Z'
  });

  const updated = await updateMessageStatus(msg.id, MESSAGE_STATUS.SENT);
  assert.equal(updated.status, MESSAGE_STATUS.SENT);
  assert.ok(updated.sentAt);
});

test('Storage: deleteMessage removes the message', async () => {
  const msg = await saveMessage({
    recipient: { phone: '+972549998877' },
    text: 'To be deleted',
    scheduledFor: '2026-10-20T06:00:00.000Z'
  });

  const success = await deleteMessage(msg.id);
  assert.equal(success, true);

  const all = await getMessages();
  assert.equal(all.some((m) => m.id === msg.id), false);
});

test('Storage: draft save, retrieve, and clear lifecycle', async () => {
  await saveDraft({
    phone: '050-999-0000',
    name: 'Draft Contact',
    text: 'Draft message content'
  });

  const draft = await getDraft();
  assert.equal(draft.phone, '050-999-0000');
  assert.equal(draft.text, 'Draft message content');
  assert.ok(draft.savedAt);

  await clearDraft();
  const cleared = await getDraft();
  assert.equal(cleared, null);
});

test('Storage: checkAndTransitionDueMessages transitions past scheduled items to due', async () => {
  const pastDate = new Date(Date.now() - 60 * 1000).toISOString();
  const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const dueItem = await saveMessage({
    recipient: { phone: '+972501230000' },
    text: 'Overdue item',
    scheduledFor: pastDate
  });

  const futureItem = await saveMessage({
    recipient: { phone: '+972501231111' },
    text: 'Future item',
    scheduledFor: futureDate
  });

  const newlyDue = await checkAndTransitionDueMessages(new Date());
  assert.ok(newlyDue.some((m) => m.id === dueItem.id));

  const refreshedDue = (await getMessages()).find((m) => m.id === dueItem.id);
  assert.equal(refreshedDue.status, MESSAGE_STATUS.DUE);

  const refreshedFuture = (await getMessages()).find((m) => m.id === futureItem.id);
  assert.equal(refreshedFuture.status, MESSAGE_STATUS.SCHEDULED);
});

test('Storage: saves message with attachments and autoSend flag', async () => {
  const msg = await saveMessage({
    recipient: { phone: '+972509876543' },
    text: 'Check this document and photo',
    attachments: [
      { id: 'att-1', name: 'invoice.pdf', size: 1024, type: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0x' },
      { id: 'att-2', name: 'photo.jpg', size: 2048, type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }
    ],
    autoSend: true,
    scheduledFor: '2026-10-20T06:00:00.000Z'
  });

  assert.equal(msg.autoSend, true);
  assert.equal(msg.attachments.length, 2);
  assert.equal(msg.attachments[0].name, 'invoice.pdf');
  assert.equal(msg.attachments[1].name, 'photo.jpg');
});

test('Storage: allows message with attachment only (empty text)', async () => {
  const msg = await saveMessage({
    recipient: { phone: '+972509876543' },
    text: '',
    attachments: [
      { id: 'att-3', name: 'receipt.pdf', size: 500, type: 'application/pdf', dataUrl: 'data:application/pdf;base64,JVBERi0x' }
    ],
    scheduledFor: '2026-10-20T06:00:00.000Z'
  });

  assert.equal(msg.attachments.length, 1);
  assert.equal(msg.text, '');
});

test('Storage: rejects message if both text and attachments are missing', async () => {
  await assert.rejects(
    async () => {
      await saveMessage({
        recipient: { phone: '+972509876543' },
        text: '',
        attachments: [],
        scheduledFor: '2026-10-20T06:00:00.000Z'
      });
    },
    { message: /Message text or attachment is required/ }
  );
});

test('Storage: drafts preserve attachments and autoSend flag', async () => {
  await saveDraft({
    phone: '050-123-4567',
    text: 'Draft with file',
    autoSend: true,
    attachments: [{ id: 'att-d', name: 'draft.png', size: 300, type: 'image/png', dataUrl: 'data:image/png;base64,iVBORw' }]
  });

  const draft = await getDraft();
  assert.equal(draft.autoSend, true);
  assert.equal(draft.attachments.length, 1);
  assert.equal(draft.attachments[0].name, 'draft.png');
  await clearDraft();
});

test('Storage: saves, lists, and deletes frequent contacts', async () => {
  const contact1 = await saveContact({
    name: 'Dana Levi',
    phone: '052-123-4567'
  });

  assert.ok(contact1.id);
  assert.equal(contact1.name, 'Dana Levi');
  assert.equal(contact1.phone, '+972521234567');

  const contact2 = await saveContact({
    name: 'Avi Cohen',
    phone: '050-987-6543'
  });

  const contacts = await getContacts();
  assert.ok(contacts.length >= 2);
  // Should be sorted by name: Avi before Dana
  assert.equal(contacts[0].name, 'Avi Cohen');

  // Updating contact by existing phone
  const updated = await saveContact({
    name: 'Dana Levi (Work)',
    phone: '+972521234567'
  });
  assert.equal(updated.name, 'Dana Levi (Work)');

  // Delete contact
  const deleted = await deleteContact(contact2.id);
  assert.equal(deleted, true);

  const remaining = await getContacts();
  assert.equal(remaining.some((c) => c.id === contact2.id), false);
});

