// Limites de upload. O processamento é todo no navegador (o arquivo nunca sobe
// pro servidor), mas decode + getImageData por frame de um arquivo grande trava
// a aba. 10 MB cobre fotos e clipes curtos com folga.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function validateUploadSize(bytes, max = MAX_UPLOAD_BYTES) {
  if (bytes <= max) return { ok: true };
  const mb = (bytes / 1048576).toFixed(1);
  const maxMb = Math.round(max / 1048576);
  return { ok: false, message: `Arquivo muito grande (${mb} MB). O limite é ${maxMb} MB.` };
}
