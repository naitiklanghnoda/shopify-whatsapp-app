const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// In-memory cache to prevent duplicate messages
const sentMessagesCache = {};
const messageTimeout = 43200000; // 12 hour
const sendDelay = 900000; // 15 minute delay before sending

// ✅ Register a test phone number (for sandbox mode)
async function registerTestNumber(phoneNumber) {
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/test_whatsapp_business_phone_numbers`,
            { whatsapp_business_phone_number: phoneNumber },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );
        console.log("✅ Test number registered:", response.data);
    } catch (error) {
        console.error("❌ Error registering test number:",
            error.response ? JSON.stringify(error.response.data, null, 2) : error.message
        );
    }
}

// ✅ Send WhatsApp message using a pre-approved template
async function sendWhatsAppMessage(phoneNumber, customerName, checkoutUrl) {
    try {
        console.log(`🚀 Sending WhatsApp message to: ${phoneNumber}`);

        const response = await axios.post(
            `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to: phoneNumber,
                type: "template",
                template: {
                    name: "abandoned_checkout",  // Your pre-approved template name
                    language: { code: "en_us" },
                    components: [
                        {
                            type: "body",
                            parameters: [
                                { type: "text", text: customerName || "Customer" },
                            ]
                        }
                    ]
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
            }
        );

        console.log("✅ WhatsApp message sent successfully:", response.data);
    } catch (error) {
        console.error("❌ Error sending WhatsApp message:",
            error.response ? JSON.stringify(error.response.data, null, 2) : error.message
        );
    }
}

// ✅ Shopify webhook endpoint
app.post("/webhook", async (req, res) => {
    console.log("📩 Received webhook:", JSON.stringify(req.body, null, 2));

    const checkoutId = req.body.id;
    let phoneNumberRaw = req.body.phone || (req.body.shipping_address ? req.body.shipping_address.phone : null);
    const abandonedCheckoutUrl = req.body.abandoned_checkout_url;
    const customerName = req.body.customer ? req.body.customer.first_name : "Customer";

    if (!phoneNumberRaw || !abandonedCheckoutUrl) {
        console.error("❌ Missing phone number or checkout URL");
        return res.status(400).send("Bad Request: Missing phone number or checkout URL");
    }

    // ✅ Remove country code (+91) and non-numeric characters
    let phoneNumber = phoneNumberRaw.replace(/\D/g, "");
    if (phoneNumber.startsWith("91")) {
        phoneNumber = phoneNumber.substring(2);
    }

    console.log(`📞 Formatted Phone Number: ${phoneNumber}`);

    if (sentMessagesCache[checkoutId]) {
        console.log(`✅ Message already scheduled for checkout ID: ${checkoutId}`);
        return res.status(200).send("Message already scheduled");
    }

    // Optional: Register test number (if using sandbox mode)
    await registerTestNumber(phoneNumber);

    // Store checkout ID in cache
    sentMessagesCache[checkoutId] = true;

    // ✅ Schedule message to be sent after a delay
    setTimeout(() => {
        sendWhatsAppMessage(phoneNumber, customerName, abandonedCheckoutUrl);
    }, sendDelay);

    // ✅ Clear cache after 10 minutes
    setTimeout(() => {
        delete sentMessagesCache[checkoutId];
        console.log(`🗑️ Cache cleared for checkout ID: ${checkoutId}`);
    }, messageTimeout);

    res.status(200).send("Webhook processed, message scheduled");
});

// ✅ Start server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
