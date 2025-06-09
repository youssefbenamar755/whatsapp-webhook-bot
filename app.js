const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const qrcode = require('qrcode-terminal');
const path = require('path');

// Initialize Express app
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Skip ngrok browser warning
app.use((req, res, next) => {
    res.header('ngrok-skip-browser-warning', 'true');
    next();
});

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// WhatsApp client status
let clientReady = false;
let qrCodeGenerated = false;

// Generate QR Code
client.on('qr', (qr) => {
    console.log('\n=== SCAN QR CODE WITH YOUR WHATSAPP ===');
    qrcode.generate(qr, { small: true });
    console.log('\nAfter scanning, wait for "WhatsApp is ready!" message');
    qrCodeGenerated = true;
});

// Client ready
client.on('ready', () => {
    console.log('\n✅ WhatsApp is ready!');
    console.log('🌐 Open http://localhost:3000 in your browser');
    clientReady = true;
});

// Handle incoming messages
client.on('message', async (message) => {
    console.log('\n📨 New message received:');
    console.log(`From: ${message.from}`);
    console.log(`Message: ${message.body}`);
    console.log(`Time: ${new Date().toLocaleString()}`);
    console.log('---');
});

// Handle authentication
client.on('authenticated', () => {
    console.log('✅ WhatsApp authenticated successfully');
});

// Handle authentication failure
client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

// Handle disconnection
client.on('disconnected', (reason) => {
    console.log('❌ WhatsApp disconnected:', reason);
    clientReady = false;
});

// Initialize WhatsApp client
console.log('🚀 Starting WhatsApp API...');
client.initialize();

// API Routes

// Check status
app.get('/api/status', (req, res) => {
    res.json({
        status: clientReady ? 'ready' : 'not ready',
        qrGenerated: qrCodeGenerated,
        ready: clientReady
    });
});

// Send text message
app.post('/api/send-message', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp client is not ready. Please scan QR code first.'
            });
        }

        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and message are required'
            });
        }

        // Format phone number (add country code if needed)
        let formattedNumber = number.replace(/\D/g, ''); // Remove non-digits
        if (!formattedNumber.includes('@')) {
            formattedNumber = formattedNumber + '@c.us';
        }

        // Send message
        const response = await client.sendMessage(formattedNumber, message);
        
        console.log(`✅ Message sent to ${number}: ${message}`);
        
        res.json({
            success: true,
            message: 'Message sent successfully',
            messageId: response.id.id
        });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Send media (image, document)
app.post('/api/send-media', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp client is not ready'
            });
        }

        const { number, mediaUrl, caption } = req.body;

        if (!number || !mediaUrl) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and media URL are required'
            });
        }

        let formattedNumber = number.replace(/\D/g, '');
        if (!formattedNumber.includes('@')) {
            formattedNumber = formattedNumber + '@c.us';
        }

        const media = await MessageMedia.fromUrl(mediaUrl);
        const response = await client.sendMessage(formattedNumber, media, { caption });

        console.log(`✅ Media sent to ${number}`);

        res.json({
            success: true,
            message: 'Media sent successfully',
            messageId: response.id.id
        });

    } catch (error) {
        console.error('❌ Error sending media:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get chat list
app.get('/api/chats', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(400).json({
                success: false,
                error: 'WhatsApp client is not ready'
            });
        }

        const chats = await client.getChats();
        const chatList = chats.slice(0, 20).map(chat => ({
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            lastMessage: chat.lastMessage?.body || 'No messages',
            timestamp: chat.timestamp
        }));

        res.json({
            success: true,
            chats: chatList
        });

    } catch (error) {
        console.error('❌ Error getting chats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Webhook endpoint for Fluent Forms
app.post('/webhook/fluent-forms', async (req, res) => {
    try {
        console.log('📋 New form submission received:', req.body);
        
        // Extract form data
        const formData = req.body;
        const submissionData = formData.data || formData;
        
        // Get the CLIENT's phone number from the form
        const clientPhone = submissionData.phone || submissionData.mobile;
        
        if (!clientPhone) {
            console.log('❌ No phone number provided in form submission');
            return res.status(400).json({
                success: false,
                message: 'No phone number provided in form'
            });
        }
        
        // Format the message TO SEND TO THE CLIENT
        let messageToClient = `Hello ${submissionData.name || submissionData.names || 'there'}! 👋\n\n`;
        messageToClient += `Thank you for contacting us through our website. We have received your message:\n\n`;
        
        if (submissionData.subject) {
            messageToClient += `📝 **Subject:** ${submissionData.subject}\n`;
        }
        
        if (submissionData.message || submissionData.description) {
            messageToClient += `💬 **Your Message:** ${submissionData.message || submissionData.description}\n\n`;
        }
        
        messageToClient += `We will get back to you as soon as possible! 🙏\n\n`;
        messageToClient += `Best regards,\nYour Team`;
        
        // Send WhatsApp message to the CLIENT's number
        if (clientReady) {
            // Format the client's phone number
            let formattedClientNumber = clientPhone.replace(/\D/g, ''); // Remove non-digits
            
            // Add country code if not present (assuming Morocco +212)
            if (!formattedClientNumber.startsWith('212') && formattedClientNumber.length < 12) {
                formattedClientNumber = '212' + formattedClientNumber.replace(/^0/, ''); // Remove leading 0 if present
            }
            
            formattedClientNumber = formattedClientNumber + '@c.us';
            
            await client.sendMessage(formattedClientNumber, messageToClient);
            console.log(`✅ Message sent to client: ${clientPhone}`);
            
            // Optional: Also send notification to YOUR business number for tracking
            const businessNumber = '+212770063593';
            const businessNotification = `🔔 *New Form Submission - Message Sent to Client*\n\n`;
            businessNotification += `👤 **Client:** ${submissionData.name || 'N/A'}\n`;
            businessNotification += `📱 **Phone:** ${clientPhone}\n`;
            businessNotification += `📧 **Email:** ${submissionData.email || 'N/A'}\n`;
            businessNotification += `💬 **Message:** ${submissionData.message || submissionData.description || 'N/A'}\n`;
            businessNotification += `\n⏰ **Time:** ${new Date().toLocaleString()}`;
            businessNotification += `\n✅ **Status:** Message sent to client`;
            
            const formattedBusinessNumber = businessNumber.replace(/\D/g, '') + '@c.us';
            
            setTimeout(async () => {
                try {
                    await client.sendMessage(formattedBusinessNumber, businessNotification);
                    console.log('✅ Business notification sent');
                } catch (error) {
                    console.error('❌ Failed to send business notification:', error);
                }
            }, 3000);
            
        } else {
            console.log('❌ WhatsApp not ready, cannot send message to client');
            return res.status(500).json({
                success: false,
                message: 'WhatsApp client not ready'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Message sent to client successfully',
            clientPhone: clientPhone
        });
        
    } catch (error) {
        console.error('❌ Webhook error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test webhook endpoint
app.post('/webhook/test', (req, res) => {
    console.log('🧪 Test webhook received:', req.body);
    res.json({ success: true, message: 'Test webhook received' });
});

// Start server
app.listen(PORT, () => {
    console.log(`🌐 Server running on http://localhost:${PORT}`);
    console.log('📱 Waiting for WhatsApp QR code...\n');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down WhatsApp API...');
    await client.destroy();
    process.exit();
});