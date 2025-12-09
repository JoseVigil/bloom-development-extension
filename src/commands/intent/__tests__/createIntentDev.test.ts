// src/commands/intent/__tests__/createIntentDev.test.ts
import * as assert from 'assert';
import * as vscode from 'vscode';
import { generateUID, ensureUniqueUID } from '../createIntentDev';
import * as sinon from 'sinon';   // ← NUEVO

suite('Intent DEV Creation Tests', () => {

    test('UID generation format', () => {
        const uid = generateUID();
        assert.strictEqual(uid.length, 3);
        assert.match(uid, /^[a-z0-9]{3}$/);
    });

    test('UID uniqueness check', async () => {
        const workspaceUri = vscode.Uri.file('/fake/workspace');

        // SINON: mock del método stat
        const statStub  = sinon.stub(vscode.workspace.fs, 'stat');
        statStub.rejects(new Error('File not found')); // siempre falla → carpeta no existe

        const uid1 = await ensureUniqueUID('test-intent', workspaceUri);
        const uid2 = await ensureUniqueUID('test-intent', workspaceUri);

        assert.notStrictEqual(uid1, uid2);
        assert.strictEqual(uid1.length, 3);

        // Restaurar el método original
        statStub.restore();
    });

    test('Intent name validation', () => {
        assert.strictEqual(/^[a-z0-9-]+$/.test('fix-login-crash'), true);
        assert.strictEqual(/^[a-z0-9-]+$/.test('Fix_Login'), false);
    });
});