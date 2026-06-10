import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_UPLOAD_BYTES, validateUploadSize } from '../site/limits.js';

test('limite é 10 MB', () => {
  assert.equal(MAX_UPLOAD_BYTES, 10 * 1024 * 1024);
});

test('aceita arquivo abaixo do limite', () => {
  assert.deepEqual(validateUploadSize(1024), { ok: true });
});

test('aceita arquivo exatamente no limite', () => {
  assert.deepEqual(validateUploadSize(MAX_UPLOAD_BYTES), { ok: true });
});

test('rejeita arquivo acima do limite com mensagem em MB', () => {
  const r = validateUploadSize(MAX_UPLOAD_BYTES + 1);
  assert.equal(r.ok, false);
  assert.match(r.message, /10\.0 MB/);
  assert.match(r.message, /10 MB/);
});

test('mensagem informa o tamanho do arquivo rejeitado', () => {
  const r = validateUploadSize(25 * 1024 * 1024);
  assert.equal(r.ok, false);
  assert.match(r.message, /25\.0 MB/);
});
