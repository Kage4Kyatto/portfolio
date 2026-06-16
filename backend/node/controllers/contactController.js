const fs = require("fs");
const path = require("path");

const messagesPath = path.join(__dirname, "..", "..", "php", "data", "messages.json");

const readMessages = () => {
  try {
    const file = fs.readFileSync(messagesPath, "utf8");
    return JSON.parse(file || "[]");
  } catch (error) {
    return [];
  }
};

const writeMessages = (messages) => {
  fs.writeFileSync(messagesPath, JSON.stringify(messages, null, 2));
};

const getHealth = (req, res) => {
  const notifyTo = String(process.env.CONTACT_NOTIFY_TO || "").trim();
  const resendApiKey = String(process.env.RESEND_API_KEY || "").trim();
  const notifyFrom = String(process.env.CONTACT_NOTIFY_FROM || "").trim();

  let mode = "disabled";

  if (notifyTo) {
    mode = resendApiKey ? "resend" : "php-mail-fallback";
  }

  res.status(200).json({
    status: "ok",
    service: "portfolio-api",
    timestamp: new Date().toISOString(),
    notifications: {
      mode,
      toConfigured: Boolean(notifyTo),
      fromConfigured: Boolean(notifyFrom),
      providerConfigured: Boolean(resendApiKey)
    }
  });
};

const getMessages = (req, res) => {
  const messages = readMessages();
  res.status(200).json(messages);
};

const submitContact = (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({
      success: false,
      message: "All fields are required."
    });
  }

  const messages = readMessages();
  const newMessage = {
    id: Date.now(),
    name,
    email,
    subject,
    message,
    createdAt: new Date().toISOString()
  };

  messages.push(newMessage);
  writeMessages(messages);

  return res.status(201).json({
    success: true,
    message: "Message received successfully.",
    data: newMessage
  });
};

module.exports = {
  getHealth,
  getMessages,
  submitContact
};
