import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();

test('Stage 1 Setup: package.json is valid', () => {
  const pkgPath = path.join(ROOT_DIR, 'package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkg.type, 'module');
});

test('Stage 1 Setup: manifest.json is valid MV3 structure', () => {
  const manifestPath = path.join(ROOT_DIR, 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name.includes('WhatsApp'));
  assert.equal(manifest.background.service_worker, 'src/background/service-worker.js');
  assert.equal(manifest.side_panel.default_path, 'src/ui/panel.html');

  // Verify permissions
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('alarms'));

  // Verify icons exist
  for (const [size, relPath] of Object.entries(manifest.icons)) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `Icon ${size}px must exist at ${relPath}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 0, `Icon ${size}px must not be empty`);

    // Verify PNG header (89 50 4E 47 0D 0A 1A 0A)
    const buf = fs.readFileSync(fullPath);
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4e);
    assert.equal(buf[3], 0x47);
  }
});

test('Stage 1 Setup: UI and background files exist and are readable', () => {
  const requiredFiles = [
    'src/background/service-worker.js',
    'src/core/types.js',
    'src/ui/panel.html',
    'src/ui/panel.css',
    'src/ui/panel.js'
  ];

  for (const relPath of requiredFiles) {
    const fullPath = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(fullPath), `${relPath} must exist`);
  }
});

test('UI Compactness: Auto-send in Due tab, custom toggle, and contacts dropdown', () => {
  const htmlPath = path.join(ROOT_DIR, 'src/ui/panel.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // 1. Auto-send toggle is in Due tab and has no subtitle
  const dueViewIndex = html.indexOf('id="view-due"');
  const autoSendIndex = html.indexOf('id="auto-send-toggle"');
  assert.ok(dueViewIndex !== -1, 'view-due must exist');
  assert.ok(autoSendIndex > dueViewIndex, 'auto-send-toggle must be inside view-due tab');
  assert.ok(!html.includes('toggle-desc'), 'Auto-send toggle subtitle must be removed');

  // 2. Schedule radio buttons removed, replaced with custom schedule toggle
  assert.ok(!html.includes('name="scheduleOption"'), 'Radio buttons for scheduleOption must be removed');
  assert.ok(html.includes('id="custom-schedule-toggle"'), 'custom-schedule-toggle must be present');

  // 3. Contacts dropdown and save contact button present
  assert.ok(html.includes('id="contact-select"'), 'contact-select dropdown must be present');
  assert.ok(html.includes('id="btn-save-contact"'), 'btn-save-contact must be present');
  assert.ok(html.includes('id="btn-delete-contact"'), 'btn-delete-contact must be present');
});

