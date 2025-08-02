# ReplyBolt License Server

Simple license server for managing ReplyBolt Chrome extension subscriptions via PayPal.

## Features

✅ PayPal webhook integration  
✅ License key generation and validation  
✅ Admin dashboard with stats  
✅ JSON file storage (no database needed)  
✅ Export licenses to CSV  
✅ Manual license creation

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and set your admin password
ADMIN_PASSWORD=your-secure-password
```

### 3. Run the Server

```bash
# Development
npm run dev

# Production
npm start
```

### 4. Access Admin Dashboard

- URL: `http://localhost:3000/admin`
- Username: `admin`
- Password: (whatever you set in .env)

## Deployment

### Deploy to Railway.app (Recommended)

1. Push this code to GitHub
2. Go to [railway.app](https://railway.app)
3. Click "New Project" → "Deploy from GitHub"
4. Select your repo
5. Add environment variable: `ADMIN_PASSWORD`
6. Deploy!

Your server will be live at: `https://your-app.railway.app`

### Deploy to Render.com

1. Push to GitHub
2. Go to [render.com](https://render.com)
3. Create new "Web Service"
4. Connect GitHub repo
5. Add environment variable: `ADMIN_PASSWORD`
6. Deploy!

## PayPal Setup

### 1. Create PayPal Subscription Plans

In your PayPal account, create these subscription plans:

- **Monthly**: $9.99/month (ID: monthly)
- **Annual**: $99/year (ID: annual)
- **Lifetime**: $199 one-time (ID: lifetime)

### 2. Set Up Webhook

1. Go to PayPal Developer Dashboard
2. Select your app
3. Add webhook URL: `https://your-domain.com/webhook/paypal`
4. Subscribe to events:
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `PAYMENT.SALE.COMPLETED`
   - `BILLING.SUBSCRIPTION.CANCELLED`

## Integration with Extension

### In your extension's background.js:

```javascript
// Check license validity
async function checkLicense(licenseKey) {
	const response = await fetch("https://your-server.com/api/verify", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ licenseKey })
	})

	const result = await response.json()
	return result.valid
}
```

### In your extension's options.js:

```javascript
// Save license key
function activateLicense() {
	const key = document.getElementById("licenseKey").value
	chrome.storage.sync.set(
		{
			license_key: key
		},
		() => {
			checkLicense(key).then(valid => {
				if (valid) {
					showMessage("License activated!")
				} else {
					showMessage("Invalid license key")
				}
			})
		}
	)
}
```

## API Endpoints

### POST /webhook/paypal

Receives PayPal payment notifications and creates licenses.

### POST /api/verify

```json
Request:
{
    "licenseKey": "RB-XXXX-XXXX-XXXX-XXXX"
}

Response:
{
    "valid": true,
    "email": "user@example.com",
    "expiresAt": "2025-03-01T00:00:00.000Z",
    "subscriptionType": "monthly"
}
```

### GET /admin

Admin dashboard (password protected)

### POST /api/admin/create-license

Manually create a license (requires auth)

```json
Request:
{
    "email": "user@example.com",
    "subscriptionType": "lifetime"
}

Response:
{
    "success": true,
    "licenseKey": "RB-XXXX-XXXX-XXXX-XXXX",
    "expiresAt": "2125-01-01T00:00:00.000Z"
}
```

## Data Storage

Licenses are stored in `./data/licenses.json`:

```json
{
	"RB-XXXX-XXXX-XXXX-XXXX": {
		"email": "user@example.com",
		"subscriptionId": "I-XXXXXXXXXXXXX",
		"subscriptionType": "monthly",
		"status": "active",
		"createdAt": "2024-01-01T00:00:00.000Z",
		"expiresAt": "2024-02-01T00:00:00.000Z"
	}
}
```

## Troubleshooting

### PayPal webhook not working?

- Check webhook URL is correct
- Verify events are subscribed
- Check server logs for errors

### License not validating?

- Check server is running
- Verify CORS is enabled
- Check license key format

### Can't access admin panel?

- Check password in .env
- Use username: `admin`
- Clear browser auth cache

## Security Notes

1. **Change the default admin password!**
2. Keep your server URL private
3. Use HTTPS in production
4. Backup your data files regularly

## Support

For issues or questions about the server, please check the logs first.
The server logs all important events to help with debugging.
