import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { defineString } from 'firebase-functions/params';

const adminEmail = defineString('ADMIN_EMAIL');
const smtp2goApiKey = defineString('SMTP2GO_API_KEY', { default: '' });
const smtp2goSender = defineString('SMTP2GO_SENDER', { default: '' });
const smtp2goSenderName = defineString('SMTP2GO_SENDER_NAME', { default: 'Supply Chain Resilience' });
const smtp2goReplyTo = defineString('SMTP2GO_REPLY_TO', { default: '' });

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSenderAddress(email: string) {
  const senderName = smtp2goSenderName.value().trim();
  return senderName.length > 0 ? `${senderName} <${email}>` : email;
}

async function sendEmail(to: string, subject: string, textBody: string, htmlBody: string) {
  const apiKey = smtp2goApiKey.value();
  const senderEmail = smtp2goSender.value().trim();
  const replyToEmail = smtp2goReplyTo.value().trim();

  if (!apiKey || !senderEmail) {
    console.log(`[EMAIL SKIP] Missing SMTP2GO config. Would send to ${to}: ${subject}`);
    return;
  }

  const payload: Record<string, unknown> = {
    to: [to],
    sender: formatSenderAddress(senderEmail),
    subject,
    text_body: textBody,
    html_body: htmlBody,
  };

  if (replyToEmail) {
    payload.reply_to = [formatSenderAddress(replyToEmail)];
  }

  try {
    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || (typeof result?.data?.failed === 'number' && result.data.failed > 0)) {
      console.error('Email send failed:', result);
      return;
    }

    console.log('Email sent:', result);
  } catch (err) {
    console.error('Email send failed:', err);
  }
}

export const onInstructorCreated = onDocumentCreated(
  'instructors/{uid}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const safeName = escapeHtml(String(data.displayName ?? ''));
    const safeEmail = escapeHtml(String(data.email ?? ''));
    const safeInstitution = escapeHtml(String(data.institution ?? ''));

    await sendEmail(
      adminEmail.value(),
      'New Instructor Application',
      `New instructor application\n\nName: ${data.displayName}\nEmail: ${data.email}\nInstitution: ${data.institution}\n\nLog in to the admin dashboard to review this application.`,
      `<h2>New Instructor Application</h2>
      <p><strong>Name:</strong> ${safeName}</p>
      <p><strong>Email:</strong> ${safeEmail}</p>
      <p><strong>Institution:</strong> ${safeInstitution}</p>
      <p>Log in to the admin dashboard to review this application.</p>`
    );
  }
);

export const onInstructorStatusChanged = onDocumentUpdated(
  'instructors/{uid}',
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    if (before.status === after.status) return;

    const uid = event.params.uid;

    // Set custom claims based on status
    if (after.status === 'approved') {
      await admin.auth().setCustomUserClaims(uid, { role: 'instructor' });
      const displayName = String(after.displayName ?? 'Instructor');
      const safeDisplayName = escapeHtml(displayName);
      await sendEmail(
        after.email,
        'Your instructor access is approved',
        `Hello ${displayName},

Your instructor registration for Supply Chain Resilience has been approved.

You can now sign in with the same email address and password you used during registration.

If you did not request instructor access, please reply to ${adminEmail.value()}.

Thank you,
Supply Chain Resilience`,
        `<p>Hello ${safeDisplayName},</p>
        <p>Your instructor registration for Supply Chain Resilience has been approved.</p>
        <p>You can now sign in with the same email address and password you used during registration.</p>
        <p>If you did not request instructor access, please reply to ${escapeHtml(adminEmail.value())}.</p>
        <p>Thank you,<br />Supply Chain Resilience</p>`
      );
    } else if (after.status === 'denied' || after.status === 'revoked') {
      await admin.auth().setCustomUserClaims(uid, { role: null });
      const action = after.status === 'denied' ? 'denied' : 'revoked';
      await sendEmail(
        after.email,
        `Application ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        `Your instructor access has been ${action}. Contact the administrator for more information.`,
        `<p>Your instructor access has been ${escapeHtml(action)}. Contact the administrator for more information.</p>`
      );
    }
  }
);
