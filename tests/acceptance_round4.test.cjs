const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test, describe } = require('node:test');

const html = fs.readFileSync('web_dist/index.html', 'utf8');

describe('Round 4: In-App Updates and Auto-Backup on Save Acceptance Tests', () => {

    test('UI elements for In-App Update exist in DOM', () => {
        assert.ok(html.includes('id="app-update-card"'), 'app-update-card must exist');
        assert.ok(html.includes('id="check-update-btn"'), 'check-update-btn must exist');
        assert.ok(html.includes('id="update-available-banner"'), 'update-available-banner must exist');
        assert.ok(html.includes('id="download-update-btn"'), 'download-update-btn must exist');
        assert.ok(html.includes('id="app-update-modal"'), 'app-update-modal must exist');
        assert.ok(html.includes('id="update-modal-install-btn"'), 'update-modal-install-btn must exist');
        assert.ok(html.includes('id="update-modal-later-btn"'), 'update-modal-later-btn must exist');
    });

    test('UI elements for Auto Backup on Save exist in DOM', () => {
        assert.ok(html.includes('id="auto-backup-on-save-container"'), 'auto-backup-on-save-container must exist');
        assert.ok(html.includes('id="backup-on-save-enabled"'), 'backup-on-save-enabled checkbox must exist');
        assert.ok(html.includes('id="auto-backup-status-text"'), 'auto-backup-status-text must exist');
    });

    test('onUpdateCheckResult opens modal and banner when update is available', () => {
        // Create mock DOM elements
        const elements = {};
        const getElement = (id) => {
            if (!elements[id]) {
                elements[id] = {
                    classList: {
                        _classes: new Set(['hidden']),
                        add(c) { this._classes.add(c); },
                        remove(c) { this._classes.delete(c); },
                        contains(c) { return this._classes.has(c); }
                    },
                    textContent: '',
                    style: {},
                    dataset: {}
                };
            }
            return elements[id];
        };

        const toasts = [];
        const sandbox = {
            getElement,
            showToast: (msg, type) => toasts.push({ msg, type }),
            lucide: { createIcons: () => {} },
            window: {}
        };

        const ctx = vm.createContext(sandbox);

        // Extract and run onUpdateCheckResult and onUpdateDownloadStatus from index.html
        const start = html.indexOf('window.onUpdateCheckResult = function(');
        const end = html.indexOf('// --- CLOUD BACKUP LISTENERS ---', start);
        assert.ok(start > 0 && end > start, 'Update handlers block must be located in index.html');
        vm.runInContext(html.slice(start, end), ctx);

        // Call onUpdateCheckResult with update available
        ctx.window.onUpdateCheckResult(true, {
            updateAvailable: true,
            versionName: '1.2.0',
            versionCode: 3,
            notes: 'Multi-date bulk entry and auto backup',
            publishedAt: '2026-11-13T00:00:00Z'
        });

        assert.ok(!elements['app-update-modal'].classList.contains('hidden'), 'Update modal must be shown');
        assert.ok(!elements['update-available-banner'].classList.contains('hidden'), 'Update banner must be shown');
        assert.equal(elements['update-modal-version-badge'].textContent, 'v1.2.0');
        assert.equal(elements['update-modal-notes'].textContent, 'Multi-date bulk entry and auto backup');
        assert.ok(elements['app-update-status-msg'].textContent.includes('v1.2.0'));
        assert.ok(toasts.some(t => t.msg.includes('v1.2.0')));

        // Call onUpdateDownloadStatus
        ctx.window.onUpdateDownloadStatus('downloading', 'Downloading update');
        assert.equal(elements['update-modal-progress-bar'].style.width, '70%');

        ctx.window.onUpdateDownloadStatus('permission', 'Allow installs from Smart Salary');
        assert.equal(elements['update-modal-progress-text'].textContent, 'Allow installs from Smart Salary');

        ctx.window.onUpdateDownloadStatus('error', 'Permission declined');
        assert.equal(elements['update-modal-install-btn'].disabled, false);

        ctx.window.onUpdateDownloadStatus('verified', 'Update verified');
        assert.equal(elements['update-modal-progress-bar'].style.width, '100%');
    });

    test('onUpdateCheckResult informs user when already on latest version', () => {
        const elements = {};
        const getElement = (id) => {
            if (!elements[id]) {
                elements[id] = {
                    classList: {
                        _classes: new Set(['hidden']),
                        add(c) { this._classes.add(c); },
                        remove(c) { this._classes.delete(c); },
                        contains(c) { return this._classes.has(c); }
                    },
                    textContent: '',
                    style: {},
                    dataset: {}
                };
            }
            return elements[id];
        };

        const toasts = [];
        const sandbox = {
            getElement,
            showToast: (msg, type) => toasts.push({ msg, type }),
            lucide: { createIcons: () => {} },
            window: {}
        };

        const ctx = vm.createContext(sandbox);
        const start = html.indexOf('window.onUpdateCheckResult = function(');
        const end = html.indexOf('// --- CLOUD BACKUP LISTENERS ---', start);
        vm.runInContext(html.slice(start, end), ctx);

        ctx.window.onUpdateCheckResult(true, {
            updateAvailable: false,
            currentVersionName: '1.1.0',
            versionCode: 2
        });

        assert.ok(elements['app-update-modal'].classList.contains('hidden'), 'Update modal must remain hidden');
        assert.ok(elements['update-available-banner'].classList.contains('hidden'), 'Update banner must remain hidden');
        assert.ok(elements['app-update-status-msg'].textContent.includes('နောက်ဆုံးထွက်'));
        assert.ok(toasts.some(t => t.msg.includes('နောက်ဆုံးထွက်')));
    });

    test('saveState triggers storeBackupCopy and triggerDebouncedAutoBackup', () => {
        let storedData = null;
        const mockAndroidBridge = {
            storeBackupCopy(data) { storedData = data; },
            isLoggedIn() { return false; },
            isWebMock: false
        };

        const storage = new Map();
        const localStorage = {
            getItem: k => storage.get(k) ?? null,
            setItem: (k, v) => storage.set(k, String(v)),
            removeItem: k => storage.delete(k)
        };

        const sandbox = {
            window: { AndroidBridge: mockAndroidBridge },
            AndroidBridge: mockAndroidBridge,
            localStorage,
            location: { reload() {} },
            getElement: () => ({ textContent: '' }),
            console,
            setTimeout: () => 1,
            clearTimeout: () => {}
        };

        const ctx = vm.createContext(sandbox);

        // State setup
        const stateCode = `
            let loadedStateStorageKey = 'dailySalaryTrackerState:basic';
            const getStateStorageKey = () => 'dailySalaryTrackerState:basic';
            const state = {
                timeData: [{ date: '2026-11-13', type: 'regular_base', pay: 82560 }],
                settings: { backup_on_save_enabled: true }
            };
        `;

        const start = html.indexOf('const saveState = () => {');
        const end = html.indexOf('const loadState = () => {', start);
        assert.ok(start > 0 && end > start, 'saveState block must exist');

        vm.runInContext(stateCode + html.slice(start, end) + '\nsaveState();', ctx);

        assert.ok(storedData !== null, 'storeBackupCopy must be called');
        assert.ok(storedData.includes('2026-11-13'), 'Stored backup data must contain current records');
    });
});
