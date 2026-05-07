res.send(`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${v.vehicleNumber} | FleetQR</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,600;14..32,700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body {
        font-family: 'Inter', sans-serif;
        background: linear-gradient(145deg, #0f172a 0%, #0a0f1c 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
      }
      .card {
        max-width: 450px;
        width: 100%;
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(16px);
        border-radius: 2rem;
        border: 1px solid rgba(255,255,255,0.1);
        overflow: hidden;
        box-shadow: 0 25px 45px -12px black;
      }
      .vehicle-icon {
        background: linear-gradient(135deg, #1e293b, #0f172a);
        padding: 2rem;
        text-align: center;
      }
      .vehicle-icon i {
        font-size: 4rem;
        color: #60a5fa;
      }
      .content {
        padding: 2rem;
      }
      .badge {
        display: inline-block;
        background: #3b82f6;
        padding: 0.25rem 1rem;
        border-radius: 2rem;
        font-size: 0.75rem;
        font-weight: 600;
        margin-bottom: 1rem;
      }
      h1 {
        font-size: 1.8rem;
        color: white;
        margin-bottom: 0.25rem;
      }
      .owner {
        color: #94a3b8;
        margin-bottom: 1.5rem;
        border-left: 3px solid #3b82f6;
        padding-left: 0.75rem;
      }
      .info-row {
        display: flex;
        padding: 0.8rem 0;
        border-bottom: 1px solid #1e293b;
      }
      .info-icon {
        width: 2rem;
        color: #60a5fa;
      }
      .info-label {
        flex: 1;
        font-weight: 500;
        color: #cbd5e1;
      }
      .info-value {
        font-weight: 600;
        color: white;
      }
      .actions {
        display: flex;
        gap: 0.8rem;
        margin-top: 2rem;
      }
      .btn {
        flex: 1;
        padding: 0.8rem;
        border-radius: 2rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        text-decoration: none;
        transition: 0.2s;
      }
      .btn-call { background: #10b981; color: white; }
      .btn-sms { background: #3b82f6; color: white; }
      .btn-wa { background: #25d366; color: white; }
      .btn:hover { transform: translateY(-2px); filter: brightness(1.05); }
      .footer {
        text-align: center;
        font-size: 0.7rem;
        color: #475569;
        margin-top: 1.5rem;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="vehicle-icon">
        <i class="fas fa-car"></i>
      </div>
      <div class="content">
        <span class="badge"><i class="fas fa-qrcode"></i> Digital Passport</span>
        <h1>${v.vehicleNumber}</h1>
        <div class="owner"><i class="fas fa-user-circle"></i> ${v.ownerName}</div>
        <div class="info-row">
          <div class="info-icon"><i class="fas fa-phone-alt"></i></div>
          <div class="info-label">Contact</div>
          <div class="info-value">${v.phoneNumber}</div>
        </div>
        <div class="info-row">
          <div class="info-icon"><i class="fas fa-calendar-alt"></i></div>
          <div class="info-label">Issued</div>
          <div class="info-value">${new Date(v.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="actions">
          <a href="tel:${v.phoneNumber}" class="btn btn-call"><i class="fas fa-phone-alt"></i> Call</a>
          <a href="sms:${v.phoneNumber}" class="btn btn-sms"><i class="fas fa-comment"></i> SMS</a>
          <a href="https://wa.me/${v.phoneNumber.replace(/[^0-9]/g, '')}" class="btn btn-wa"><i class="fab fa-whatsapp"></i> WhatsApp</a>
        </div>
        <div class="footer">
          <i class="fas fa-shield-alt"></i> Secure QR • Report if found
        </div>
      </div>
    </div>
  </body>
  </html>
`);
