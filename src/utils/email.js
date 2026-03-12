const nodemailer = require('nodemailer');

function createTransporter() {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
        return null;
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

function formatTime(time) {
    const hour = parseInt(time);
    if (hour === 0) return '12:00 AM';
    if (hour === 12) return '12:00 PM';
    if (hour > 12) return `${hour - 12}:00 PM`;
    return `${hour}:00 AM`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function sendBookingConfirmation(reservation) {
    const transporter = createTransporter();
    if (!transporter) {
        console.log('[Email] SMTP not configured. Booking confirmation skipped.');
        console.log(`[Email] Would send to: ${reservation.email}`);
        console.log(`[Email] Booking: ${reservation.booking_id} | ${reservation.name} | ${formatDate(reservation.date)} at ${formatTime(reservation.time_slot)} | Table ${reservation.table_number} | ${reservation.guests} guests`);
        return;
    }

    const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #FFF9F2;">
        <div style="background: #2B1D16; padding: 32px; text-align: center;">
            <h1 style="color: #F5E9DA; margin: 0; font-size: 24px;">The Downtown Cafe</h1>
            <p style="color: #D97706; margin: 8px 0 0; font-size: 14px;">Booking Confirmation</p>
        </div>
        <div style="padding: 32px;">
            <p style="color: #1F2933; font-size: 16px;">Hi <strong>${reservation.name}</strong>,</p>
            <p style="color: #6B7280; font-size: 15px;">Your table has been reserved successfully! Here are your booking details:</p>
            <div style="background: #F5E9DA; border-radius: 12px; padding: 24px; margin: 24px 0;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Booking ID</td><td style="padding: 8px 0; color: #2B1D16; font-weight: 600; text-align: right;">${reservation.booking_id}</td></tr>
                    <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Date</td><td style="padding: 8px 0; color: #2B1D16; font-weight: 600; text-align: right;">${formatDate(reservation.date)}</td></tr>
                    <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Time</td><td style="padding: 8px 0; color: #2B1D16; font-weight: 600; text-align: right;">${formatTime(reservation.time_slot)}</td></tr>
                    <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Table</td><td style="padding: 8px 0; color: #2B1D16; font-weight: 600; text-align: right;">Table ${reservation.table_number} (${reservation.capacity} seater)</td></tr>
                    <tr><td style="padding: 8px 0; color: #6B7280; font-size: 14px;">Guests</td><td style="padding: 8px 0; color: #2B1D16; font-weight: 600; text-align: right;">${reservation.guests}</td></tr>
                </table>
            </div>
            <p style="color: #6B7280; font-size: 14px;">📍 Sports Complex, CC/25, Kankarbagh, Patna, Bihar 800020</p>
            <p style="color: #6B7280; font-size: 14px;">📞 084070 78989</p>
            <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #E5E7EB;">
                <p style="color: #9CA3AF; font-size: 12px; text-align: center;">To cancel your reservation, use booking ID: <strong>${reservation.booking_id}</strong></p>
            </div>
        </div>
    </div>`;

    await transporter.sendMail({
        from: `"The Downtown Cafe" <${process.env.SMTP_USER}>`,
        to: reservation.email,
        subject: `Booking Confirmed - ${reservation.booking_id} | The Downtown Cafe`,
        html
    });
}

async function sendAdminNotification(reservation) {
    const transporter = createTransporter();
    const adminEmail = process.env.NOTIFICATION_EMAIL || process.env.ADMIN_EMAIL;

    if (!transporter) {
        console.log('[Admin Email] SMTP not configured. Admin notification skipped.');
        console.log(`[Admin Email] New booking: ${reservation.booking_id} | ${reservation.name} | ${reservation.phone} | ${formatDate(reservation.date)} at ${formatTime(reservation.time_slot)} | Table ${reservation.table_number} | ${reservation.guests} guests`);
        return;
    }

    const html = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #D97706; padding: 20px; text-align: center;">
            <h1 style="color: #fff; margin: 0; font-size: 20px;">🔔 New Table Booking</h1>
        </div>
        <div style="padding: 24px; background: #FFF9F2;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Booking ID</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${reservation.booking_id}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Name</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${reservation.name}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Phone</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${reservation.phone}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Email</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${reservation.email}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Date</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${formatDate(reservation.date)}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Time</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${formatTime(reservation.time_slot)}</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Table</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">Table ${reservation.table_number} (${reservation.capacity} seater)</td></tr>
                <tr><td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">Guests</td><td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${reservation.guests}</td></tr>
                ${reservation.special_requests ? `<tr><td style="padding: 10px; font-weight: 600;">Special Requests</td><td style="padding: 10px;">${reservation.special_requests}</td></tr>` : ''}
            </table>
        </div>
    </div>`;

    await transporter.sendMail({
        from: `"Downtown Cafe Bookings" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: `New Booking: ${reservation.name} | ${formatDate(reservation.date)} ${formatTime(reservation.time_slot)} | Table ${reservation.table_number}`,
        html
    });
}

module.exports = { sendBookingConfirmation, sendAdminNotification };
