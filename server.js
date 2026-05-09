const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ---------- Email 2FA storage ----------
const codeStore = new Map();

// ---------- Email transporter with debug ----------
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    debug: true,
    logger: true
});

// ---------- Admin login (step 1: send code) ----------
app.post('/api/admin-login', async (req, res) => {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
        return res.status(500).json({ error: 'Admin email not set' });
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000;
    codeStore.set(adminEmail, { code, expiresAt });
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: adminEmail,
            subject: 'FleetQR Pro – Login Code',
            html: `<p>Your verification code is: <strong>${code}</strong></p><p>Valid for 5 minutes.</p>`
        });
        res.json({ success: true, message: 'Code sent to your email' });
    } catch (err) {
        console.error('Email send error:', err);
        res.status(500).json({ error: 'Failed to send email. Check logs for details.' });
    }
});

// ---------- Step 2: verify code ----------
app.post('/api/verify-code', (req, res) => {
    const { code } = req.body;
    const adminEmail = process.env.ADMIN_EMAIL;
    const record = codeStore.get(adminEmail);
    if (!record) return res.status(401).json({ error: 'No code requested or expired' });
    if (Date.now() > record.expiresAt) {
        codeStore.delete(adminEmail);
        return res.status(401).json({ error: 'Code expired, login again' });
    }
    if (record.code !== code) return res.status(401).json({ error: 'Invalid code' });
    codeStore.delete(adminEmail);
    const token = Buffer.from(Date.now().toString()).toString('base64');
    res.json({ success: true, token });
});

// ---------- All your existing vehicle routes go here (same as before) ----------
// (I assume you have the full vehicle management code – paste it below)
// ... (keep your /api/vehicles, /api/stats, /api/generate, etc.)

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server on port ${PORT}`));
