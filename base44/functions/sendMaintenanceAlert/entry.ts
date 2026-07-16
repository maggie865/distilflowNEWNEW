import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

function base64UrlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data, old_data } = body;

    // Only send when flagged for followup
    if (!data?.requires_followup) {
      return Response.json({ skipped: true, reason: 'not flagged' });
    }

    // For updates, skip if already flagged before (avoid duplicate alerts)
    if (event?.type === 'update' && old_data?.requires_followup === true) {
      return Response.json({ skipped: true, reason: 'already flagged' });
    }

    // Get admin users to alert
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 100);
    const adminEmails = allUsers.filter(u => u.role === 'admin' && u.email).map(u => u.email);

    if (adminEmails.length === 0) {
      return Response.json({ skipped: true, reason: 'no admin emails found' });
    }

    // Get Gmail access token
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('gmail');

    const equipmentName = data.equipment_name || 'Unknown equipment';
    const checkType = data.maintenance_type || 'maintenance';
    const checkItem = data.check_item_name || '';
    const date = data.date || '';
    const performedBy = data.performed_by || 'Unknown';
    const notes = data.notes || data.description || '';

    const subject = `⚠ Maintenance Alert: ${equipmentName}${checkItem ? ' — ' + checkItem : ''}`;

    const lines = [
      'A maintenance record has been flagged for follow-up.',
      '',
      `Equipment: ${equipmentName}`,
      `Check Type: ${checkType}`,
    ];
    if (checkItem) lines.push(`Check Item: ${checkItem}`);
    lines.push(`Date: ${date}`);
    lines.push(`Performed by: ${performedBy}`);
    if (data.check_springs) lines.push(`Springs: ${data.check_springs}`);
    if (data.wash_abv != null) lines.push(`Wash ABV: ${data.wash_abv}%`);
    if (data.alcohol_condition) lines.push(`Alcohol Condition: ${data.alcohol_condition}`);
    if (data.result) lines.push(`Result: ${data.result}`);
    if (notes) lines.push(`Notes: ${notes}`);
    lines.push('', 'Please review and take action as needed.');

    const bodyText = lines.join('\n');

    const rawEmail = [
      `To: ${adminEmails.join(', ')}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      bodyText,
    ].join('\r\n');

    const encoded = base64UrlEncode(rawEmail);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return Response.json({ error: 'Gmail API error: ' + errorText }, { status: 500 });
    }

    const result = await response.json();
    return Response.json({ success: true, messageId: result.id, sentTo: adminEmails });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});