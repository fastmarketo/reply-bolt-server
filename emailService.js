// emailService.js - Email functionality for ReplyBolt License Server
const nodemailer = require("nodemailer")

// Email configuration from environment variables
const emailConfig = {
	host: process.env.EMAIL_HOST,
	port: process.env.EMAIL_PORT || 587,
	secure: false, // true for 465, false for other ports
	auth: {
		user: process.env.EMAIL_USER,
		pass: process.env.EMAIL_PASS
	}
}

// Check if email is configured
const isEmailConfigured = () => {
	return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS)
}

// Create transporter only if email is configured
let transporter = null
if (isEmailConfigured()) {
	transporter = nodemailer.createTransport(emailConfig)
}

// Format date nicely
const formatDate = dateString => {
	const date = new Date(dateString)
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric"
	})
}

// Send license email
const sendLicenseEmail = async licenseData => {
	// Skip if email not configured
	if (!isEmailConfigured()) {
		console.log("Email not configured, skipping email send")
		return { sent: false, reason: "Email not configured" }
	}

	const { email, licenseKey, extensionName, subscriptionType, expiresAt } = licenseData

	// Format subscription type nicely
	const planName = subscriptionType.charAt(0).toUpperCase() + subscriptionType.slice(1)

	// Create expiry text
	let expiryText = ""
	if (subscriptionType === "lifetime") {
		expiryText = "This license never expires!"
	} else {
		expiryText = `Valid until: ${formatDate(expiresAt)}`
	}

	// HTML email template
	const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #1976d2;
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
        }
        .content {
            background-color: #f9f9f9;
            padding: 40px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .license-box {
            background-color: white;
            border: 2px solid #1976d2;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .license-key {
            font-family: 'Courier New', monospace;
            font-size: 20px;
            font-weight: bold;
            color: #1976d2;
            letter-spacing: 1px;
            margin: 10px 0;
        }
        .details {
            background-color: #e8f4f8;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .details-row {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
        }
        .details-label {
            font-weight: bold;
            color: #666;
        }
        .steps {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .step {
            margin: 15px 0;
            padding-left: 30px;
            position: relative;
        }
        .step::before {
            content: attr(data-step);
            position: absolute;
            left: 0;
            background-color: #1976d2;
            color: white;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: bold;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
        }
        .button {
            display: inline-block;
            background-color: #1976d2;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎉 Your ${extensionName} License is Ready!</h1>
    </div>
    
    <div class="content">
        <p>Hi there!</p>
        
        <p>Thank you for your purchase! Your ${extensionName} license has been activated and is ready to use.</p>
        
        <div class="license-box">
            <div>Your License Key:</div>
            <div class="license-key">${licenseKey}</div>
            <small style="color: #666;">Keep this key safe - you'll need it to activate the extension</small>
        </div>
        
        <div class="details">
            <h3 style="margin-top: 0;">License Details:</h3>
            <div class="details-row">
                <span class="details-label">Extension:</span>
                <span>${extensionName}</span>
            </div>
            <div class="details-row">
                <span class="details-label">Plan Type:</span>
                <span>${planName} Subscription</span>
            </div>
            <div class="details-row">
                <span class="details-label">Licensed Email:</span>
                <span>${email}</span>
            </div>
            <div class="details-row">
                <span class="details-label">Status:</span>
                <span style="color: #4caf50; font-weight: bold;">Active ✓</span>
            </div>
            <div class="details-row">
                <span class="details-label">${subscriptionType === "lifetime" ? "Validity:" : "Expires:"}</span>
                <span>${subscriptionType === "lifetime" ? "Lifetime Access" : formatDate(expiresAt)}</span>
            </div>
        </div>
        
        <div class="steps">
            <h3 style="margin-top: 0;">How to Activate Your License:</h3>
            <div class="step" data-step="1">
                <strong>Open ${extensionName}</strong><br>
                Click on the extension icon in your Chrome toolbar
            </div>
            <div class="step" data-step="2">
                <strong>Go to Settings</strong><br>
                Look for the settings or options button in the extension
            </div>
            <div class="step" data-step="3">
                <strong>Enter License Key</strong><br>
                Paste your license key in the activation field
            </div>
            <div class="step" data-step="4">
                <strong>Click Activate</strong><br>
                You're all set! Enjoy using ${extensionName}
            </div>
        </div>
        
        <p><strong>Need Help?</strong><br>
        If you have any questions or issues with activation, please don't hesitate to contact our support team.</p>
        
        <center>
            <a href="mailto:support@replybolt.com" class="button">Contact Support</a>
        </center>
    </div>
    
    <div class="footer">
        <p>This is an automated email. Please do not reply directly to this message.</p>
        <p>© ${new Date().getFullYear()} ${extensionName}. All rights reserved.</p>
    </div>
</body>
</html>
    `

	// Plain text version
	const textContent = `
Your ${extensionName} License is Ready!

Thank you for your purchase! Your license has been activated.

LICENSE KEY: ${licenseKey}

License Details:
- Extension: ${extensionName}
- Plan: ${planName} Subscription
- Email: ${email}
- Status: Active
- ${expiryText}

How to Activate:
1. Open ${extensionName} in Chrome
2. Go to Settings/Options
3. Enter your license key
4. Click Activate

Need help? Contact support@replybolt.com

This is an automated email. Please do not reply directly to this message.
© ${new Date().getFullYear()} ${extensionName}. All rights reserved.
    `

	// Email options
	const mailOptions = {
		from: process.env.EMAIL_FROM || `${extensionName} <noreply@replybolt.com>`,
		to: email,
		subject: `Your ${extensionName} License Key - ${planName} Plan`,
		text: textContent,
		html: htmlContent
	}

	try {
		const info = await transporter.sendMail(mailOptions)
		console.log("License email sent successfully:", info.messageId)
		return { sent: true, messageId: info.messageId }
	} catch (error) {
		console.error("Failed to send license email:", error)
		return { sent: false, error: error.message }
	}
}

// Send revocation email
const sendRevocationEmail = async revocationData => {
	// Skip if email not configured
	if (!isEmailConfigured()) {
		console.log("Email not configured, skipping revocation email")
		return { sent: false, reason: "Email not configured" }
	}

	const { email, licenseKey, extensionName, reason } = revocationData

	// HTML email template for revocation
	const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #f44336;
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
        }
        .content {
            background-color: #f9f9f9;
            padding: 40px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .warning-box {
            background-color: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
        }
        .license-key {
            font-family: 'Courier New', monospace;
            font-size: 18px;
            font-weight: bold;
            color: #f44336;
            letter-spacing: 1px;
            margin: 10px 0;
        }
        .reason-box {
            background-color: #ffebee;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #f44336;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
        }
        .button {
            display: inline-block;
            background-color: #1976d2;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚠️ License Revoked</h1>
    </div>
    
    <div class="content">
        <p>Hi there,</p>
        
        <p>We're writing to inform you that your ${extensionName} license has been revoked.</p>
        
        <div class="warning-box">
            <div>Revoked License Key:</div>
            <div class="license-key">${licenseKey}</div>
            <p style="color: #856404; margin-top: 10px;">This license is no longer valid and cannot be used to activate the extension.</p>
        </div>
        
        ${
					reason
						? `
        <div class="reason-box">
            <strong>Reason for revocation:</strong><br>
            ${reason}
        </div>
        `
						: ""
				}
        
        <h3>What happens next?</h3>
        <ul>
            <li>The extension will stop working with this license key</li>
            <li>You will need a new license to continue using ${extensionName}</li>
            <li>Any active features will be disabled</li>
        </ul>
        
        <p><strong>Need a new license?</strong><br>
        If you believe this revocation was made in error or would like to purchase a new license, please contact our support team.</p>
        
        <center>
            <a href="mailto:support@replybolt.com" class="button">Contact Support</a>
        </center>
    </div>
    
    <div class="footer">
        <p>This is an automated email regarding your ${extensionName} license.</p>
        <p>© ${new Date().getFullYear()} ${extensionName}. All rights reserved.</p>
    </div>
</body>
</html>
    `

	// Plain text version
	const textContent = `
License Revoked - ${extensionName}

We're writing to inform you that your license has been revoked.

REVOKED LICENSE KEY: ${licenseKey}

${reason ? `Reason for revocation: ${reason}\n` : ""}

What happens next:
- The extension will stop working with this license key
- You will need a new license to continue using ${extensionName}
- Any active features will be disabled

If you believe this revocation was made in error or would like to purchase a new license, please contact support@replybolt.com

This is an automated email regarding your ${extensionName} license.
© ${new Date().getFullYear()} ${extensionName}. All rights reserved.
    `

	// Email options
	const mailOptions = {
		from: process.env.EMAIL_FROM || `${extensionName} <noreply@replybolt.com>`,
		to: email,
		subject: `Important: Your ${extensionName} License Has Been Revoked`,
		text: textContent,
		html: htmlContent
	}

	try {
		const info = await transporter.sendMail(mailOptions)
		console.log("Revocation email sent successfully:", info.messageId)
		return { sent: true, messageId: info.messageId }
	} catch (error) {
		console.error("Failed to send revocation email:", error)
		return { sent: false, error: error.message }
	}
}

// Send deletion email
const sendDeletionEmail = async deletionData => {
	// Skip if email not configured
	if (!isEmailConfigured()) {
		console.log("Email not configured, skipping deletion email")
		return { sent: false, reason: "Email not configured" }
	}

	const { email, extensionName, subscriptionType } = deletionData

	// HTML email template for deletion
	const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
        }
        .header {
            background-color: #9e9e9e;
            color: white;
            padding: 30px;
            text-align: center;
            border-radius: 10px 10px 0 0;
        }
        .content {
            background-color: #f9f9f9;
            padding: 40px;
            border-radius: 0 0 10px 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .info-box {
            background-color: #e8f4f8;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #1976d2;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 14px;
        }
        .button {
            display: inline-block;
            background-color: #1976d2;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>License Deleted</h1>
    </div>
    
    <div class="content">
        <p>Hi there,</p>
        
        <p>This email confirms that your ${extensionName} license has been permanently deleted from our system.</p>
        
        <div class="info-box">
            <h3 style="margin-top: 0;">What this means:</h3>
            <ul style="margin-bottom: 0;">
                <li>Your ${subscriptionType} subscription has been removed</li>
                <li>The extension will no longer function with your previous license key</li>
                <li>All license data has been permanently deleted</li>
                <li>This action cannot be undone</li>
            </ul>
        </div>
        
        <p><strong>Want to continue using ${extensionName}?</strong><br>
        You'll need to purchase a new license. We offer flexible plans to suit your needs:</p>
        
        <ul>
            <li>Monthly - $9.99/month</li>
            <li>Annual - $99/year (save 17%)</li>
            <li>Lifetime - $199 one-time payment</li>
        </ul>
        
        <p>If you have any questions or concerns about this deletion, please don't hesitate to contact our support team.</p>
        
        <center>
            <a href="mailto:support@replybolt.com" class="button">Contact Support</a>
        </center>
    </div>
    
    <div class="footer">
        <p>This is an automated confirmation of license deletion.</p>
        <p>© ${new Date().getFullYear()} ${extensionName}. All rights reserved.</p>
    </div>
</body>
</html>
    `

	// Plain text version
	const textContent = `
License Deleted - ${extensionName}

This email confirms that your ${extensionName} license has been permanently deleted from our system.

What this means:
- Your ${subscriptionType} subscription has been removed
- The extension will no longer function with your previous license key
- All license data has been permanently deleted
- This action cannot be undone

Want to continue using ${extensionName}?
You'll need to purchase a new license. We offer:
- Monthly - $9.99/month
- Annual - $99/year (save 17%)
- Lifetime - $199 one-time payment

If you have any questions, please contact support@replybolt.com

This is an automated confirmation of license deletion.
© ${new Date().getFullYear()} ${extensionName}. All rights reserved.
    `

	// Email options
	const mailOptions = {
		from: process.env.EMAIL_FROM || `${extensionName} <noreply@replybolt.com>`,
		to: email,
		subject: `${extensionName} License Deleted - Confirmation`,
		text: textContent,
		html: htmlContent
	}

	try {
		const info = await transporter.sendMail(mailOptions)
		console.log("Deletion confirmation email sent successfully:", info.messageId)
		return { sent: true, messageId: info.messageId }
	} catch (error) {
		console.error("Failed to send deletion email:", error)
		return { sent: false, error: error.message }
	}
}

// Export functions
module.exports = {
	sendLicenseEmail,
	sendRevocationEmail,
	sendDeletionEmail,
	isEmailConfigured
}
