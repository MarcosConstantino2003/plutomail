import DOMPurify from 'dompurify';
import { fetchAttachmentBlob, API_BASE } from './mailApi';

// Resolves inline image attachments (cid:, attachment:, or direct download URLs) into blob
// object URLs, then returns sanitized HTML plus a map of attachmentId -> { url, size }.
export async function renderMessageBody(message, token) {
  let html = message.html?.join?.('') || message.html || `<pre>${message.text || ''}</pre>`;
  if (Array.isArray(message.html)) html = message.html.join('');

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const resolved = {};
  const imageAttachments = (message.attachments || []).filter((att) =>
    att.contentType?.startsWith('image/')
  );

  await Promise.all(
    imageAttachments.map(async (att) => {
      let isReferenced = false;

      if (att.contentId) {
        const cleanId = att.contentId.replace(/[<>]/g, '');
        if (html.includes(`cid:${cleanId}`)) isReferenced = true;
      }
      if (!isReferenced) {
        doc.querySelectorAll('img').forEach((img) => {
          if (img.getAttribute('src')?.includes(att.downloadUrl)) isReferenced = true;
        });
      }
      if (!isReferenced && html.includes(`attachment:${att.id}`)) isReferenced = true;

      try {
        const blob = await fetchAttachmentBlob(token, att.downloadUrl);
        const objectUrl = URL.createObjectURL(blob);
        resolved[att.id] = { url: objectUrl, size: blob.size };

        if (isReferenced) {
          if (att.contentId) {
            const cleanId = att.contentId.replace(/[<>]/g, '');
            html = html.split(`cid:${cleanId}`).join(objectUrl);
          }
          html = html.split(`${API_BASE}${att.downloadUrl}`).join(objectUrl);
          html = html.split(att.downloadUrl).join(objectUrl);
          html = html.split(`attachment:${att.id}`).join(objectUrl);
        }
      } catch {
        // if the attachment fails to load, we simply skip the inline preview
      }
    })
  );

  const cleanupDoc = parser.parseFromString(html, 'text/html');
  cleanupDoc.querySelectorAll('img').forEach((img) => {
    const src = (img.getAttribute('src') || '').trim().toLowerCase();
    if (src.startsWith('attachment:') || src.startsWith('cid:')) {
      img.removeAttribute('src');
    }
  });
  html = cleanupDoc.body.innerHTML;

  const safeHtml = DOMPurify.sanitize(html, { ADD_TAGS: ['style'] });

  return { html: safeHtml, resolvedAttachments: resolved };
}
