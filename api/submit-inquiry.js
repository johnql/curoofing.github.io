const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
const nodemailer = require('nodemailer');

function createMailer() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://curoofing.ca');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, address, city, province, postcode, phone, email, message } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Full name is required.' });
  }
  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  // Normalize to satisfy DB constraints
  // phone → exactly 10 digits (strips spaces, dashes, parentheses, country code +1)
  const phoneDigits = phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
  if (phoneDigits.length !== 10) {
    return res.status(400).json({ error: 'Please enter a valid 10-digit phone number.' });
  }
  // postcode → uppercase, ensure space after 3rd character (e.g. "m1v1p1" → "M1V 1P1")
  const rawPostcode = (postcode || '').trim().toUpperCase().replace(/\s+/g, '');
  const normalizedPostcode = rawPostcode.length === 6
    ? `${rawPostcode.slice(0, 3)} ${rawPostcode.slice(3)}`
    : rawPostcode || null;

  const errors = [];
  const addressLine = [address, city, province, normalizedPostcode].filter(Boolean).join(', ');

  // 1. Save to Supabase
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );
    const { error: dbError } = await supabase.from('inquiries').insert([{
      name: name.trim(),
      address: address?.trim() || null,
      city: city?.trim() || null,
      province: province || null,
      postcode: normalizedPostcode,
      phone: phoneDigits,
      email: email?.trim() || null,
      message: message?.trim() || null,
    }]);
    if (dbError) errors.push(`Supabase: ${dbError.message}`);
  } catch (err) {
    errors.push(`Supabase: ${err.message}`);
  }

  // 2. Send SMS to salesperson via Twilio
  try {
    const smsBody = [
      'New CU Roofing Inquiry!',
      `Name: ${name.trim()}`,
      `Phone: ${phone.trim()}`,
      email ? `Email: ${email.trim()}` : null,
      addressLine ? `Address: ${addressLine}` : null,
      message ? `Message: ${message.trim()}` : null,
    ].filter(Boolean).join('\n');

    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const recipients = (process.env.TWILIO_TO_NUMBER || '')
      .split(/[;,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      throw new Error('TWILIO_TO_NUMBER must contain at least one phone number');
    }

    for (const to of recipients) {
      await client.messages.create({
        body: smsBody,
        from: process.env.TWILIO_FROM_NUMBER,
        to,
      });
    }
  } catch (err) {
    errors.push(`Twilio: ${err.message}`);
  }

  // 3. Send confirmation email to customer via Gmail (only if email provided)
  if (email && email.trim()) {
    try {
      const mailer = createMailer();
      const year = new Date().getFullYear();

      await mailer.sendMail({
        from: `CU Roofing <${process.env.GMAIL_USER}>`,
        to: email.trim(),
        subject: 'Thank You for Your Inquiry — CU Roofing',
        html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:30px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#1a1a1a;padding:24px 32px;text-align:center;">
            <h1 style="margin:0;color:#F96D00;font-size:28px;letter-spacing:1px;">CU Roofing</h1>
            <p style="margin:4px 0 0;color:#cccccc;font-size:13px;">Affordable, Efficient &amp; Trustworthy Roofer in GTA</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="font-size:16px;color:#333;">Dear <strong>${name.trim()}</strong>,</p>
            <p style="font-size:15px;color:#555;line-height:1.7;">
              Thank you for reaching out to <strong>CU Roofing</strong>! We have received your inquiry and one of our team members will be in touch with you shortly to discuss your roofing needs.
            </p>
            <table width="100%" cellpadding="12" cellspacing="0" style="background:#f9f9f9;border-radius:6px;margin:24px 0;border:1px solid #e8e8e8;">
              <tr><td colspan="2" style="font-size:14px;font-weight:bold;color:#F96D00;border-bottom:1px solid #e8e8e8;padding-bottom:8px;">Your Inquiry Details</td></tr>
              <tr><td style="font-size:14px;color:#666;width:130px;">Name</td><td style="font-size:14px;color:#333;">${name.trim()}</td></tr>
              <tr style="background:#fff;"><td style="font-size:14px;color:#666;">Phone</td><td style="font-size:14px;color:#333;">${phone.trim()}</td></tr>
              ${email ? `<tr><td style="font-size:14px;color:#666;">Email</td><td style="font-size:14px;color:#333;">${email.trim()}</td></tr>` : ''}
              ${addressLine ? `<tr style="background:#fff;"><td style="font-size:14px;color:#666;">Address</td><td style="font-size:14px;color:#333;">${addressLine}</td></tr>` : ''}
              ${message ? `<tr><td style="font-size:14px;color:#666;vertical-align:top;">Message</td><td style="font-size:14px;color:#333;">${message.trim()}</td></tr>` : ''}
            </table>
            <p style="font-size:15px;color:#555;line-height:1.7;">In the meantime, feel free to reach us directly:</p>
            <p style="font-size:15px;color:#333;">
              📞 <a href="tel:4168300685" style="color:#F96D00;text-decoration:none;">(416) 830-0685</a><br>
              ✉️ <a href="mailto:curoofing.ca@gmail.com" style="color:#F96D00;text-decoration:none;">CURoofing.ca@gmail.com</a>
            </p>
            <p style="font-size:15px;color:#555;line-height:1.7;">We look forward to serving you!</p>
            <p style="font-size:15px;color:#333;">Best regards,<br><strong>The CU Roofing Team</strong></p>
          </td>
        </tr>
        <tr>
          <td style="background:#1a1a1a;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#888;">&copy; ${year} CU Roofing </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
      });
    } catch (err) {
      errors.push(`Gmail: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('Non-fatal submission errors:', errors);
  }

  return res.status(200).json({ success: true });
};
