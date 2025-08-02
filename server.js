// Load environment variables first
require("dotenv").config()

// server.js - Enhanced License Server for ReplyBolt
const express = require("express")
const cors = require("cors")
const fs = require("fs").promises
const path = require("path")
const crypto = require("crypto")
const { sendLicenseEmail, sendRevocationEmail, sendDeletionEmail, isEmailConfigured } = require("./emailService")

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Data file paths
const LICENSES_FILE = "./data/licenses.json"
const STATS_FILE = "./data/stats.json"

// Ensure data directory exists
async function ensureDataDir() {
	try {
		await fs.mkdir("./data", { recursive: true })

		// Initialize files if they don't exist
		try {
			await fs.access(LICENSES_FILE)
		} catch {
			await fs.writeFile(LICENSES_FILE, JSON.stringify({}))
		}

		try {
			await fs.access(STATS_FILE)
		} catch {
			await fs.writeFile(
				STATS_FILE,
				JSON.stringify({
					totalSales: 0,
					monthlyRevenue: 0,
					activeSubscriptions: 0
				})
			)
		}
	} catch (error) {
		console.error("Error creating data directory:", error)
	}
}

// Initialize data directory
ensureDataDir()

// Helper functions
async function loadLicenses() {
	try {
		const data = await fs.readFile(LICENSES_FILE, "utf8")
		return JSON.parse(data)
	} catch {
		return {}
	}
}

async function saveLicenses(licenses) {
	await fs.writeFile(LICENSES_FILE, JSON.stringify(licenses, null, 2))
}

async function loadStats() {
	try {
		const data = await fs.readFile(STATS_FILE, "utf8")
		return JSON.parse(data)
	} catch {
		return {
			totalSales: 0,
			monthlyRevenue: 0,
			activeSubscriptions: 0
		}
	}
}

async function saveStats(stats) {
	await fs.writeFile(STATS_FILE, JSON.stringify(stats, null, 2))
}

// Generate unique license key
function generateLicenseKey() {
	const prefix = "RB" // ReplyBolt
	const random = crypto.randomBytes(8).toString("hex").toUpperCase()
	return `${prefix}-${random.slice(0, 4)}-${random.slice(4, 8)}-${random.slice(8, 12)}-${random.slice(12)}`
}

// Generate extension ID from extension name
function generateExtensionId(extensionName) {
	// Convert to lowercase and replace spaces with hyphens
	// Examples: "ReplyBolt" -> "reply-bolt", "BidLancer" -> "bidlancer"
	return extensionName
		.replace(/([a-z])([A-Z])/g, "$1-$2") // Add hyphen between camelCase
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.toLowerCase()
}

// Calculate expiry date based on subscription type
function calculateExpiry(subscriptionType) {
	const now = new Date()
	switch (subscriptionType) {
		case "monthly":
			now.setMonth(now.getMonth() + 1)
			break
		case "annual":
			now.setFullYear(now.getFullYear() + 1)
			break
		case "lifetime":
			now.setFullYear(now.getFullYear() + 100) // Effectively lifetime
			break
		default:
			now.setMonth(now.getMonth() + 1) // Default to monthly
	}
	return now.toISOString()
}

// ROUTES

// 1. PayPal Webhook - Receives payment notifications
app.post("/webhook/paypal", async (req, res) => {
	try {
		// PayPal sends different event types
		const { event_type, resource } = req.body

		console.log("PayPal webhook received:", event_type)

		// Handle subscription activated
		if (event_type === "BILLING.SUBSCRIPTION.ACTIVATED" || event_type === "PAYMENT.SALE.COMPLETED") {
			const email = resource.subscriber?.email_address || resource.payer?.email_address || resource.billing_agreement_id
			const subscriptionId = resource.id || resource.billing_agreement_id
			const planId = resource.plan_id || "monthly" // Default to monthly

			// Determine subscription type from plan ID or amount
			let subscriptionType = "monthly"
			if (planId.includes("annual") || planId.includes("yearly")) {
				subscriptionType = "annual"
			} else if (planId.includes("lifetime")) {
				subscriptionType = "lifetime"
			}

			// Generate license
			const licenseKey = generateLicenseKey()
			const expiresAt = calculateExpiry(subscriptionType)

			// Load existing licenses
			const licenses = await loadLicenses()

			// Save new license
			licenses[licenseKey] = {
				email: email,
				subscriptionId: subscriptionId,
				subscriptionType: subscriptionType,
				status: "active",
				createdAt: new Date().toISOString(),
				expiresAt: expiresAt,
				paypalSubscriptionId: subscriptionId,
				extensionName: "ReplyBolt", // Default extension name
				extensionId: "reply-bolt" // Default extension ID
			}

			await saveLicenses(licenses)

			// Update stats
			const stats = await loadStats()
			stats.totalSales += 1
			stats.activeSubscriptions += 1

			// Add to monthly revenue
			const amount = resource.amount?.total || (subscriptionType === "monthly" ? 9.99 : subscriptionType === "annual" ? 99 : 199)
			stats.monthlyRevenue += parseFloat(amount)

			await saveStats(stats)

			console.log(`New license created: ${licenseKey} for ${email}`)

			// Send email with license key (non-blocking)
			try {
				const emailResult = await sendLicenseEmail({
					email: email,
					licenseKey: licenseKey,
					extensionName: "ReplyBolt",
					subscriptionType: subscriptionType,
					expiresAt: expiresAt
				})
				if (emailResult.sent) {
					console.log(`License email sent to ${email}`)
				}
			} catch (error) {
				console.error("Error sending license email:", error)
				// Continue without failing the webhook
			}

			console.log(`
                ====================================
                NEW LICENSE CREATED
                Email: ${email}
                License: ${licenseKey}
                Type: ${subscriptionType}
                Expires: ${expiresAt}
                ====================================
            `)
		}

		// Handle subscription cancelled
		if (event_type === "BILLING.SUBSCRIPTION.CANCELLED") {
			const subscriptionId = resource.id
			const licenses = await loadLicenses()

			// Find and update license
			for (const [key, license] of Object.entries(licenses)) {
				if (license.paypalSubscriptionId === subscriptionId) {
					license.status = "cancelled"
					license.cancelledAt = new Date().toISOString()
					console.log(`License cancelled: ${key}`)
					break
				}
			}

			await saveLicenses(licenses)

			// Update stats
			const stats = await loadStats()
			stats.activeSubscriptions = Math.max(0, stats.activeSubscriptions - 1)
			await saveStats(stats)
		}

		res.status(200).send("OK")
	} catch (error) {
		console.error("Webhook error:", error)
		res.status(500).json({ error: "Webhook processing failed" })
	}
})

// 2. Verify License - Called by extension
app.post("/api/verify", async (req, res) => {
	try {
		const { licenseKey, extensionId } = req.body

		if (!licenseKey) {
			return res.json({ valid: false, error: "No license key provided" })
		}

		// Require extension ID from the extension
		if (!extensionId) {
			return res.json({ valid: false, error: "Extension ID is required" })
		}

		const licenses = await loadLicenses()
		const license = licenses[licenseKey]

		if (!license) {
			return res.json({ valid: false, error: "Invalid license key" })
		}

		// Always check extension ID match if license has one
		if (license.extensionId) {
			if (license.extensionId !== extensionId) {
				return res.json({ valid: false, error: "This license is for a different extension" })
			}
		} else {
			// For old licenses without extensionId, generate it from extensionName
			const expectedExtensionId = generateExtensionId(license.extensionName || "ReplyBolt")
			if (expectedExtensionId !== extensionId) {
				return res.json({ valid: false, error: "This license is for a different extension" })
			}
		}

		// Check if license is active and not expired
		const now = new Date()
		const expiryDate = new Date(license.expiresAt)

		const isValid = license.status === "active" && now < expiryDate

		res.json({
			valid: isValid,
			email: isValid ? license.email : null,
			expiresAt: isValid ? license.expiresAt : null,
			subscriptionType: isValid ? license.subscriptionType : null,
			extensionName: isValid ? license.extensionName : null
		})
	} catch (error) {
		console.error("Verify error:", error)
		res.status(500).json({ valid: false, error: "Server error" })
	}
})

// 3. Admin Dashboard - Enhanced HTML interface
app.get("/admin", async (req, res) => {
	// Basic auth check
	const auth = req.headers.authorization
	const expectedAuth = "Basic " + Buffer.from(`admin:${process.env.ADMIN_PASSWORD || "changeme"}`).toString("base64")

	if (auth !== expectedAuth) {
		res.setHeader("WWW-Authenticate", 'Basic realm="Admin Area"')
		return res.status(401).send("Authentication required")
	}

	const licenses = await loadLicenses()
	const stats = await loadStats()
	const emailConfigured = isEmailConfigured()

	// Helper function for generating extension IDs in the template
	const generateExtensionIdForTemplate = extensionName => {
		return extensionName
			.replace(/([a-z])([A-Z])/g, "$1-$2")
			.replace(/\s+/g, "-")
			.toLowerCase()
	}

	// Generate HTML dashboard
	const html = `
<!DOCTYPE html>
<html>
<head>
    <title>ReplyBolt License Dashboard</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #1976d2;
            margin-bottom: 30px;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .stat-card {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            border: 1px solid #e9ecef;
        }
        .stat-value {
            font-size: 36px;
            font-weight: bold;
            color: #1976d2;
            margin: 10px 0;
        }
        .stat-label {
            color: #666;
            font-size: 14px;
        }
        .email-status {
            background: ${emailConfigured ? "#d4edda" : "#f8d7da"};
            color: ${emailConfigured ? "#155724" : "#721c24"};
            padding: 10px 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            display: inline-block;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #1976d2;
            color: white;
            font-weight: 500;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        tr:hover {
            background-color: #f5f5f5;
        }
        .status-active {
            color: #4caf50;
            font-weight: 500;
        }
        .status-cancelled {
            color: #f44336;
            font-weight: 500;
        }
        .status-revoked {
            color: #ff9800;
            font-weight: 500;
        }
        .license-key {
            font-family: monospace;
            background: #f5f5f5;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        .search-filters {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
        }
        .search-filters input, .search-filters select {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }
        .search-filters input[type="text"] {
            flex: 1;
            min-width: 250px;
        }
        .btn {
            padding: 10px 20px;
            background: #1976d2;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        .btn:hover {
            background: #1565c0;
        }
        .btn-danger {
            background: #f44336;
        }
        .btn-danger:hover {
            background: #d32f2f;
        }
        .btn-warning {
            background: #ff9800;
        }
        .btn-warning:hover {
            background: #f57c00;
        }
        .btn-small {
            padding: 5px 10px;
            font-size: 12px;
        }
        .actions {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
        }
        .license-actions {
            display: flex;
            gap: 5px;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.4);
        }
        .modal-content {
            background-color: #fefefe;
            margin: 10% auto;
            padding: 20px;
            border: 1px solid #888;
            width: 90%;
            max-width: 500px;
            border-radius: 8px;
        }
        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
            cursor: pointer;
        }
        .close:hover {
            color: black;
        }
        .form-group {
            margin-bottom: 15px;
        }
        .form-group label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        .form-group input, .form-group select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .email-notice {
            background: #e3f2fd;
            color: #1565c0;
            padding: 10px;
            border-radius: 5px;
            margin-top: 10px;
            font-size: 14px;
        }
        @media (max-width: 768px) {
            .container {
                padding: 15px;
            }
            table {
                font-size: 14px;
            }
            .license-key {
                font-size: 10px;
            }
            .license-actions {
                flex-direction: column;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 ReplyBolt License Dashboard</h1>
        
        <div class="email-status">
            📧 Email Service: ${emailConfigured ? "Configured ✓" : "Not Configured ✗"}
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-label">Total Sales</div>
                <div class="stat-value">${stats.totalSales}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Active Subscriptions</div>
                <div class="stat-value">${stats.activeSubscriptions}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Total Revenue</div>
                <div class="stat-value">$${stats.monthlyRevenue.toFixed(2)}</div>
            </div>
        </div>
        
        <div class="actions">
            <button class="btn" onclick="location.reload()">🔄 Refresh</button>
            <button class="btn" onclick="exportCSV()">📥 Export CSV</button>
            <button class="btn" onclick="showCreateModal()">➕ Create License</button>
        </div>
        
        <div class="search-filters">
            <input type="text" id="searchInput" placeholder="Search by email, license key, or extension name..." onkeyup="filterTable()">
            <select id="statusFilter" onchange="filterTable()">
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
                <option value="revoked">Revoked</option>
            </select>
            <select id="typeFilter" onchange="filterTable()">
                <option value="">All Types</option>
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="lifetime">Lifetime</option>
            </select>
        </div>
        
        <h2>License List (${Object.keys(licenses).length} total)</h2>
        <table id="licenseTable">
            <thead>
                <tr>
                    <th>Email</th>
                    <th>License Key</th>
                    <th>Extension</th>
                    <th>Extension ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Expires</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(licenses)
									.sort((a, b) => new Date(b[1].createdAt) - new Date(a[1].createdAt))
									.map(
										([key, license]) => `
                    <tr data-status="${license.status}" data-type="${license.subscriptionType}">
                        <td>${license.email}</td>
                        <td><span class="license-key">${key}</span></td>
                        <td>${license.extensionName || "ReplyBolt"}</td>
                        <td><span class="license-key">${license.extensionId || generateExtensionIdForTemplate(license.extensionName || "ReplyBolt")}</span></td>
                        <td>${license.subscriptionType}</td>
                        <td class="status-${license.status}">${license.status}</td>
                        <td>${new Date(license.createdAt).toLocaleDateString()}</td>
                        <td>${new Date(license.expiresAt).toLocaleDateString()}</td>
                        <td class="license-actions">
                            ${license.status === "active" ? `<button class="btn btn-warning btn-small" onclick="revokeLicense('${key}')">Revoke</button>` : ""}
                            <button class="btn btn-danger btn-small" onclick="deleteLicense('${key}')">Delete</button>
                        </td>
                    </tr>
                `
									)
									.join("")}
            </tbody>
        </table>
        
        ${Object.keys(licenses).length === 0 ? '<p style="text-align: center; color: #666; margin-top: 40px;">No licenses yet. First sale coming soon! 🎉</p>' : ""}
    </div>
    
    <!-- Create License Modal -->
    <div id="createModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeCreateModal()">&times;</span>
            <h2>Create New License</h2>
            <form id="createLicenseForm" onsubmit="createLicense(event)">
                <div class="form-group">
                    <label for="email">Email</label>
                    <input type="email" id="email" required>
                </div>
                <div class="form-group">
                    <label for="extensionName">Extension Name</label>
                    <select id="extensionName" required>
                    <option value="ReplyBolt" selected>ReplyBolt</option>
                    <option value="QuickReply Pro">QuickReply Pro</option>
                    <option value="AutoResponder">AutoResponder</option>
                    <option value="EmailHelper">EmailHelper</option>
                    <option value="Custom">Custom Extension</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="subscriptionType">Subscription Type</label>
                    <select id="subscriptionType" required>
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual</option>
                        <option value="lifetime">Lifetime</option>
                    </select>
                </div>
                <button type="submit" class="btn">Create License</button>
                ${emailConfigured ? '<div class="email-notice">✉️ License key will be emailed automatically</div>' : '<div class="email-notice">⚠️ Email not configured - display license key to user manually</div>'}
            </form>
        </div>
    </div>
    
    <script>
        function filterTable() {
            const searchInput = document.getElementById('searchInput').value.toUpperCase();
            const statusFilter = document.getElementById('statusFilter').value;
            const typeFilter = document.getElementById('typeFilter').value;
            const table = document.getElementById('licenseTable');
            const tr = table.getElementsByTagName('tr');
            
            for (let i = 1; i < tr.length; i++) {
                const tdEmail = tr[i].getElementsByTagName('td')[0];
                const tdLicense = tr[i].getElementsByTagName('td')[1];
                const tdExtension = tr[i].getElementsByTagName('td')[2];
                const status = tr[i].getAttribute('data-status');
                const type = tr[i].getAttribute('data-type');
                
                let showRow = true;
                
                // Text search
                if (searchInput) {
                    const emailText = tdEmail.textContent || tdEmail.innerText;
                    const licenseText = tdLicense.textContent || tdLicense.innerText;
                    const extensionText = tdExtension.textContent || tdExtension.innerText;
                    
                    if (!emailText.toUpperCase().includes(searchInput) && 
                        !licenseText.toUpperCase().includes(searchInput) &&
                        !extensionText.toUpperCase().includes(searchInput)) {
                        showRow = false;
                    }
                }
                
                // Status filter
                if (statusFilter && status !== statusFilter) {
                    showRow = false;
                }
                
                // Type filter
                if (typeFilter && type !== typeFilter) {
                    showRow = false;
                }
                
                tr[i].style.display = showRow ? '' : 'none';
            }
        }
        
        function exportCSV() {
            const table = document.getElementById('licenseTable');
            let csv = [];
            
            for (let i = 0; i < table.rows.length; i++) {
                let row = [];
                // Exclude the last column (Actions)
                for (let j = 0; j < table.rows[i].cells.length - 1; j++) {
                    row.push('"' + table.rows[i].cells[j].innerText.replace(/"/g, '""') + '"');
                }
                csv.push(row.join(','));
            }
            
            const csvContent = csv.join('\\n');
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'licenses_' + new Date().toISOString().split('T')[0] + '.csv';
            a.click();
        }
        
        function showCreateModal() {
            document.getElementById('createModal').style.display = 'block';
        }
        
        function closeCreateModal() {
            document.getElementById('createModal').style.display = 'none';
            document.getElementById('createLicenseForm').reset();
        }
        
        function createLicense(event) {
            event.preventDefault();
            
            const email = document.getElementById('email').value;
            const extensionName = document.getElementById('extensionName').value;
            const subscriptionType = document.getElementById('subscriptionType').value;
            
            fetch('/api/admin/create-license', {
                method: 'POST',
                headers: {
                    'Authorization': '${auth}',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: email,
                    extensionName: extensionName,
                    subscriptionType: subscriptionType
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    let message = 'License created: ' + data.licenseKey;
                    if (data.emailSent) {
                        message += '\\n\\nEmail sent successfully to ' + email;
                    } else if (!${emailConfigured}) {
                        message += '\\n\\nEmail service not configured. Please share this license key with the user.';
                    }
                    alert(message);
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(err => {
                alert('Error creating license: ' + err.message);
            });
        }
        
        function revokeLicense(licenseKey) {
            const reason = prompt('Reason for revocation (optional):');
            if (!confirm('Are you sure you want to revoke this license?')) return;
            
            fetch('/api/admin/revoke-license', {
                method: 'POST',
                headers: {
                    'Authorization': '${auth}',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    licenseKey: licenseKey,
                    reason: reason
                })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    alert('License revoked successfully');
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                }
            });
        }
        
        function deleteLicense(licenseKey) {
            if (!confirm('Are you sure you want to DELETE this license? This cannot be undone!')) return;
            
            fetch('/api/admin/delete-license', {
                method: 'POST',
                headers: {
                    'Authorization': '${auth}',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ licenseKey: licenseKey })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    alert('License deleted successfully');
                    location.reload();
                } else {
                    alert('Error: ' + (data.error || 'Unknown error'));
                }
            });
        }
        
        // Close modal when clicking outside
        window.onclick = function(event) {
            const modal = document.getElementById('createModal');
            if (event.target == modal) {
                closeCreateModal();
            }
        }
    </script>
</body>
</html>
    `

	res.send(html)
})

// 4. Manual license creation (enhanced with extension name and email)
app.post("/api/admin/create-license", async (req, res) => {
	// Basic auth check
	const auth = req.headers.authorization
	const expectedAuth = "Basic " + Buffer.from(`admin:${process.env.ADMIN_PASSWORD || "changeme"}`).toString("base64")

	if (auth !== expectedAuth) {
		return res.status(401).json({ error: "Unauthorized" })
	}

	const { email, subscriptionType = "monthly", extensionName = "ReplyBolt" } = req.body

	if (!email) {
		return res.status(400).json({ error: "Email required" })
	}

	const licenseKey = generateLicenseKey()
	const expiresAt = calculateExpiry(subscriptionType)

	const licenses = await loadLicenses()

	licenses[licenseKey] = {
		email: email,
		subscriptionId: "MANUAL-" + Date.now(),
		subscriptionType: subscriptionType,
		status: "active",
		createdAt: new Date().toISOString(),
		expiresAt: expiresAt,
		paypalSubscriptionId: null,
		manual: true,
		extensionName: extensionName,
		extensionId: generateExtensionId(extensionName)
	}

	await saveLicenses(licenses)

	// Update stats
	const stats = await loadStats()
	stats.totalSales += 1
	stats.activeSubscriptions += 1
	await saveStats(stats)

	// Send license email (non-blocking, won't break if fails)
	let emailSent = false
	try {
		const emailResult = await sendLicenseEmail({
			email: email,
			licenseKey: licenseKey,
			extensionName: extensionName,
			subscriptionType: subscriptionType,
			expiresAt: expiresAt
		})
		emailSent = emailResult.sent
		if (emailSent) {
			console.log(`License email sent to ${email}`)
		}
	} catch (error) {
		console.error("Error sending license email:", error)
		// Continue without failing the license creation
	}

	res.json({
		success: true,
		licenseKey: licenseKey,
		expiresAt: expiresAt,
		emailSent: emailSent
	})
})

// 5. Revoke license
app.post("/api/admin/revoke-license", async (req, res) => {
	// Basic auth check
	const auth = req.headers.authorization
	const expectedAuth = "Basic " + Buffer.from(`admin:${process.env.ADMIN_PASSWORD || "changeme"}`).toString("base64")

	if (auth !== expectedAuth) {
		return res.status(401).json({ error: "Unauthorized" })
	}

	const { licenseKey, reason } = req.body

	if (!licenseKey) {
		return res.status(400).json({ error: "License key required" })
	}

	const licenses = await loadLicenses()

	if (!licenses[licenseKey]) {
		return res.status(404).json({ error: "License not found" })
	}

	// Check if it was active BEFORE changing status
	const wasActive = licenses[licenseKey].status === "active"

	// Store license info before updating
	const licenseInfo = {
		email: licenses[licenseKey].email,
		licenseKey: licenseKey,
		extensionName: licenses[licenseKey].extensionName || "ReplyBolt",
		reason: reason
	}

	// Update license status to revoked
	licenses[licenseKey].status = "revoked"
	licenses[licenseKey].revokedAt = new Date().toISOString()
	if (reason) {
		licenses[licenseKey].revocationReason = reason
	}

	await saveLicenses(licenses)

	// Update stats if it WAS active (using our stored value)
	if (wasActive) {
		const stats = await loadStats()
		stats.activeSubscriptions = Math.max(0, stats.activeSubscriptions - 1)
		await saveStats(stats)
	}

	// Send revocation email (non-blocking)
	try {
		const emailResult = await sendRevocationEmail(licenseInfo)
		if (emailResult.sent) {
			console.log(`Revocation email sent to ${licenseInfo.email}`)
		}
	} catch (error) {
		console.error("Error sending revocation email:", error)
		// Continue without failing
	}

	console.log(`License revoked: ${licenseKey}`)

	res.json({
		success: true,
		message: "License revoked successfully"
	})
})

// 6. Delete license
app.post("/api/admin/delete-license", async (req, res) => {
	// Basic auth check
	const auth = req.headers.authorization
	const expectedAuth = "Basic " + Buffer.from(`admin:${process.env.ADMIN_PASSWORD || "changeme"}`).toString("base64")

	if (auth !== expectedAuth) {
		return res.status(401).json({ error: "Unauthorized" })
	}

	const { licenseKey } = req.body

	if (!licenseKey) {
		return res.status(400).json({ error: "License key required" })
	}

	const licenses = await loadLicenses()

	if (!licenses[licenseKey]) {
		return res.status(404).json({ error: "License not found" })
	}

	// Store license info before deletion for stats update and email
	const wasActive = licenses[licenseKey].status === "active"
	const licenseInfo = {
		email: licenses[licenseKey].email,
		extensionName: licenses[licenseKey].extensionName || "ReplyBolt",
		subscriptionType: licenses[licenseKey].subscriptionType
	}

	// Delete the license
	delete licenses[licenseKey]

	await saveLicenses(licenses)

	// Update stats
	const stats = await loadStats()
	stats.totalSales = Math.max(0, stats.totalSales - 1)
	if (wasActive) {
		stats.activeSubscriptions = Math.max(0, stats.activeSubscriptions - 1)
	}
	await saveStats(stats)

	// Send deletion email (non-blocking)
	try {
		const emailResult = await sendDeletionEmail(licenseInfo)
		if (emailResult.sent) {
			console.log(`Deletion email sent to ${licenseInfo.email}`)
		}
	} catch (error) {
		console.error("Error sending deletion email:", error)
		// Continue without failing
	}

	console.log(`License deleted: ${licenseKey}`)

	res.json({
		success: true,
		message: "License deleted successfully"
	})
})

// 7. Health check
app.get("/health", (req, res) => {
	res.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		uptime: process.uptime(),
		emailConfigured: isEmailConfigured()
	})
})

// Start server
app.listen(PORT, () => {
	console.log(`
    ====================================
    🚀 ReplyBolt License Server Started!
    ====================================
    
    Server running on port ${PORT}
    
    Endpoints:
    - POST /webhook/paypal        - PayPal webhooks
    - POST /api/verify            - Verify license
    - GET  /admin                 - Admin dashboard
    - POST /api/admin/create-license  - Create license
    - POST /api/admin/revoke-license  - Revoke license
    - POST /api/admin/delete-license  - Delete license
    - GET  /health                - Health check
    
    Admin Dashboard:
    - URL: http://localhost:${PORT}/admin
    - Username: admin
    - Password: ${process.env.ADMIN_PASSWORD || "changeme"}
    
    Email Service: ${isEmailConfigured() ? "Configured ✓" : "Not Configured ✗"}
    
    ====================================
    `)
})
