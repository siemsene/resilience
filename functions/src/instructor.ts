import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { defineString } from 'firebase-functions/params';

const adminEmail = defineString('ADMIN_EMAIL');
const smtp2goApiKey = defineString('SMTP2GO_API_KEY', { default: '' });

async function sendEmail(to: string, subject: string, body: string) {
  const apiKey = smtp2goApiKey.value();
  if (!apiKey) {
    console.log(`[EMAIL SKIP] No SMTP2GO key. Would send to ${to}: ${subject}`);
    return;
  }

  try {
    const response = await fetch('https://api.smtp2go.com/v3/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: [to],
        sender: `Supply Chain Game <noreply@${adminEmail.value().split('@')[1] || 'game.com'}>`,
        subject,
        html_body: body,
      }),
    });
    const result = await response.json();
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

    await sendEmail(
      adminEmail.value(),
      'New Instructor Application',
      `<h2>New Instructor Application</h2>
      <p><strong>Name:</strong> ${data.displayName}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Institution:</strong> ${data.institution}</p>
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
      await sendEmail(
        after.email,
        'Application Approved!',
        `<h2>Welcome, ${after.displayName}!</h2>
        <p>Your instructor application has been approved. You can now log in and create game sessions.</p>`
      );
    } else if (after.status === 'denied' || after.status === 'revoked') {
      await admin.auth().setCustomUserClaims(uid, { role: null });
      const action = after.status === 'denied' ? 'denied' : 'revoked';
      await sendEmail(
        after.email,
        `Application ${action.charAt(0).toUpperCase() + action.slice(1)}`,
        `<p>Your instructor access has been ${action}. Contact the administrator for more information.</p>`
      );
    }
  }
);
