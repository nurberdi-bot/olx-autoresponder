const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("OLX Автоответчик работает");
});

app.get("/olx/login", (req, res) => {
  const authUrl =
    "https://www.olx.kz/oauth/authorize/?" +
    new URLSearchParams({
      client_id: process.env.OLX_CLIENT_ID,
      response_type: "code",
      scope: process.env.OLX_SCOPE,
      redirect_uri: process.env.OLX_REDIRECT_URI,
    }).toString();

  res.redirect(authUrl);
});

app.get("/olx/callback", async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send("Ошибка: OLX не прислал code");
  }

  try {
    const response = await axios.post(
      "https://www.olx.kz/api/open/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.OLX_CLIENT_ID,
        client_secret: process.env.OLX_CLIENT_SECRET,
        code: code,
        redirect_uri: process.env.OLX_REDIRECT_URI,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("TOKENS:", response.data);

    res.send(`
      <h1>OLX подключен ✅</h1>
      <p>Токены получены. Посмотри PowerShell.</p>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
    `);
  } catch (error) {
    console.error("Ошибка получения токена:", error.response?.data || error.message);

    res.send(`
      <h1>Ошибка подключения OLX ❌</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
    `);
  }
});

app.get("/olx/threads", async (req, res) => {
  try {
    const response = await axios.get("https://www.olx.kz/api/partner/threads", {
      headers: {
        Authorization: `Bearer ${process.env.OLX_ACCESS_TOKEN}`,
        Version: "2.0",
      },
    });

    console.log("THREADS:", response.data);

    res.send(`
      <h1>Диалоги OLX ✅</h1>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
    `);
  } catch (error) {
    console.error("Ошибка получения диалогов:", error.response?.data || error.message);

    res.send(`
      <h1>Ошибка получения диалогов ❌</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
    `);
  }
});

app.get("/olx/messages/:threadId", async (req, res) => {
  const threadId = req.params.threadId;

  try {
    const response = await axios.get(
      `https://www.olx.kz/api/partner/threads/${threadId}/messages`,
      {
        headers: {
          Authorization: `Bearer ${process.env.OLX_ACCESS_TOKEN}`,
          Version: "2.0",
        },
      }
    );

    console.log("MESSAGES:", response.data);

    res.send(`
      <h1>Сообщения диалога ${threadId} ✅</h1>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
    `);
  } catch (error) {
    console.error("Ошибка получения сообщений:", error.response?.data || error.message);

    res.send(`
      <h1>Ошибка получения сообщений ❌</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
    `);
  }
});

app.get("/olx/test-reply/:threadId", async (req, res) => {
  const threadId = req.params.threadId;

  try {
    const response = await axios.post(
      `https://www.olx.kz/api/partner/threads/${threadId}/messages`,
      {
        text: "Здравствуйте! Спасибо за сообщение. Да, объявление актуально.",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OLX_ACCESS_TOKEN}`,
          Version: "2.0",
          "Content-Type": "application/json",
        },
      }
    );

    console.log("REPLY SENT:", response.data);

    res.send(`
      <h1>Тестовый ответ отправлен ✅</h1>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
    `);
  } catch (error) {
    console.error("Ошибка отправки ответа:", error.response?.data || error.message);

    res.send(`
      <h1>Ошибка отправки ответа ❌</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
    `);
  }
});

const PROCESSED_FILE = "processed.json";
const HANDOFF_FILE = "handoff.json";
const READ_THREADS_FILE = "read_threads.json";
const INSTRUCTIONS_THREADS_FILE = "instructions_threads.json";

function loadReadThreads() {
  try {
    if (!fs.existsSync(READ_THREADS_FILE)) {
      return new Set();
    }

    const data = fs.readFileSync(READ_THREADS_FILE, "utf8");
    const ids = JSON.parse(data);

    return new Set(ids);
  } catch (error) {
    console.error("Ошибка чтения read_threads.json:", error.message);
    return new Set();
  }
}

function saveReadThreads() {
  try {
    fs.writeFileSync(
      READ_THREADS_FILE,
      JSON.stringify([...readThreads], null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Ошибка сохранения read_threads.json:", error.message);
  }
}

const readThreads = loadReadThreads();

const OLX_TOKENS_FILE = "olx_tokens.json";

function loadOlxTokens() {
  try {
    if (fs.existsSync(OLX_TOKENS_FILE)) {
      const data = fs.readFileSync(OLX_TOKENS_FILE, "utf8");
      const tokens = JSON.parse(data);

      return {
        access_token: tokens.access_token || process.env.OLX_ACCESS_TOKEN,
        refresh_token: tokens.refresh_token || process.env.OLX_REFRESH_TOKEN,
        expires_at: tokens.expires_at || 0,
      };
    }
  } catch (error) {
    console.error("Ошибка чтения olx_tokens.json:", error.message);
  }

  return {
    access_token: process.env.OLX_ACCESS_TOKEN,
    refresh_token: process.env.OLX_REFRESH_TOKEN,
    expires_at: 0,
  };
}

function saveOlxTokens(tokens) {
  try {
    fs.writeFileSync(
      OLX_TOKENS_FILE,
      JSON.stringify(tokens, null, 2),
      "utf8"
    );

    process.env.OLX_ACCESS_TOKEN = tokens.access_token;
    process.env.OLX_REFRESH_TOKEN = tokens.refresh_token;

    console.log("OLX токены сохранены ✅");
  } catch (error) {
    console.error("Ошибка сохранения olx_tokens.json:", error.message);
  }
}

async function refreshOlxToken() {
  const currentTokens = loadOlxTokens();

  if (!currentTokens.refresh_token) {
    throw new Error("Нет OLX_REFRESH_TOKEN для обновления токена");
  }

  console.log("Обновляю OLX access token через refresh token...");

  try {
    const response = await axios.post(
      "https://www.olx.kz/api/open/oauth/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.OLX_CLIENT_ID,
        client_secret: process.env.OLX_CLIENT_SECRET,
        refresh_token: currentTokens.refresh_token,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const data = response.data;

    const newTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || currentTokens.refresh_token,
      expires_at: Date.now() + Number(data.expires_in || 86400) * 1000,
    };

    saveOlxTokens(newTokens);

    console.log("OLX access token обновлён ✅");

    return newTokens.access_token;
  } catch (error) {
    console.error("Ошибка обновления OLX токена:", error.response?.data || error.message);

    await sendTelegramSystemMessage(
      "⚠️ OLX refresh_token не сработал. Нужно заново пройти OAuth и получить fresh access_token + refresh_token."
    );

    throw error;
  }
}

async function sendTelegramSystemMessage(text) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log("Telegram не настроен, системное сообщение не отправлено");
    return;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text,
      }
    );
  } catch (error) {
    console.error("Ошибка системного Telegram-сообщения:", error.response?.data || error.message);
  }
}

async function olxRequest(config, retry = true) {
  const tokens = loadOlxTokens();

  const responseConfig = {
    ...config,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${tokens.access_token}`,
      Version: "2.0",
    },
  };

  try {
    return await axios(responseConfig);
  } catch (error) {
    const status = error.response?.status;
    const olxError = error.response?.data?.error;

    const tokenInvalid =
      status === 401 ||
      olxError === "invalid_token" ||
      String(error.response?.data?.error_description || "")
        .toLowerCase()
        .includes("token");

    if (retry && tokenInvalid) {
      console.log("OLX token invalid. Пробую refresh...");

      const newAccessToken = await refreshOlxToken();

      return await axios({
        ...config,
        headers: {
          ...(config.headers || {}),
          Authorization: `Bearer ${newAccessToken}`,
          Version: "2.0",
        },
      });
    }

    throw error;
  }
}

function loadHandoffThreads() {
  try {
    if (!fs.existsSync(HANDOFF_FILE)) {
      return new Set();
    }

    const data = fs.readFileSync(HANDOFF_FILE, "utf8");
    const ids = JSON.parse(data);

    return new Set(ids);
  } catch (error) {
    console.error("Ошибка чтения handoff.json:", error.message);
    return new Set();
  }
}

function saveHandoffThreads() {
  try {
    fs.writeFileSync(
      HANDOFF_FILE,
      JSON.stringify([...handoffThreads], null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Ошибка сохранения handoff.json:", error.message);
  }
}

const handoffThreads = loadHandoffThreads();

function loadInstructionsThreads() {
  try {
    if (!fs.existsSync(INSTRUCTIONS_THREADS_FILE)) {
      return new Set();
    }

    const data = fs.readFileSync(INSTRUCTIONS_THREADS_FILE, "utf8");
    const ids = JSON.parse(data);

    return new Set(ids);
  } catch (error) {
    console.error("Ошибка чтения instructions_threads.json:", error.message);
    return new Set();
  }
}

function saveInstructionsThreads() {
  try {
    fs.writeFileSync(
      INSTRUCTIONS_THREADS_FILE,
      JSON.stringify([...instructionsThreads], null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Ошибка сохранения instructions_threads.json:", error.message);
  }
}

const instructionsThreads = loadInstructionsThreads();
const INSTRUCTIONS_PROMPT_TEXT =
  "Введите !инструкции чтобы получить инструкции использования к Steam аккаунту. Если интересует любой другой вопрос, введите !помощь - и свой вопрос,чтобы позвать продавца.";

const STEAM_INSTRUCTIONS_TEXT = `🔌 Инструкция:
1. Вход
• Запусти Steam.
• Введи логин и пароль
• Обязательно отметь «Запомнить меня».

2. Установка
• Скачай нужную игру, если она ещё не установлена.

3. Запуск игры
• Запусти игру и дождись главного меню.
• Это нужно, чтобы Steam сохранил данные для офлайна.

4. Переход в офлайн
• Закрой игру.
• В клиенте Steam нажми:
Steam → Перейти в автономный режим / Go Offline...
• Подтверди. Steam перезапустится в офлайн-режиме.

5. Играй
• Запусти игру снова. Теперь она работает без интернета.

---

⚠️ Частые проблемы и решения

🛡 Семейный контроль
• Некоторые аккаунты защищены семейным контролем.
• В таком случае открой приложение Steam с ПК → библиотека будет доступна.

🛠 Вместо кнопки «Играть» появляется «Купить»

1. Включи офлайн-режим в Steam.
2. Дождись появления сообщения «Оффлайн-режим» внизу.
3. Полностью закрой Steam (останови процесс через диспетчер задач).
4. Снова запусти Steam — он откроется сразу в офлайн-режиме.
   ✅ Теперь игра станет доступной.

🔁 Выкидывает из аккаунта сразу после входа
Это происходит, если слишком много людей одновременно используют один аккаунт.
Чтобы решить проблему:

1. Запусти Steam в режиме Big Picture (иконка в правом верхнем углу).
2. Начни скачивание игры. Даже если тебя выкинет, загрузка продолжится.
3. После окончания загрузки включи офлайн-режим — теперь никто не сможет выбить тебя.

📂 Игра отсутствует в библиотеке
Возможно, она скрыта. Чтобы найти:

1. Открой приложение Steam на ПК.
2. В меню выбери: Вид → Скрытые игры.
3. Найди игру → ПКМ → Управление → Убрать из скрытых.`;

function loadProcessedMessages() {
  try {
    if (!fs.existsSync(PROCESSED_FILE)) {
      return new Set();
    }

    const data = fs.readFileSync(PROCESSED_FILE, "utf8");
    const ids = JSON.parse(data);

    return new Set(ids);
  } catch (error) {
    console.error("Ошибка чтения processed.json:", error.message);
    return new Set();
  }
}

function saveProcessedMessages() {
  try {
    fs.writeFileSync(
      PROCESSED_FILE,
      JSON.stringify([...processedMessages], null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Ошибка сохранения processed.json:", error.message);
  }
}

const processedMessages = loadProcessedMessages();
let autoreplyInitialized = false;
function getItems(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

async function getThreads() {
  const response = await olxRequest({
    method: "GET",
    url: "https://www.olx.kz/api/partner/threads",
  });

  return getItems(response.data);
}

async function getMessages(threadId) {
  const response = await olxRequest({
    method: "GET",
    url: `https://www.olx.kz/api/partner/threads/${threadId}/messages`,
  });

  return getItems(response.data);
}

async function sendMessage(threadId, text) {
  const response = await olxRequest({
    method: "POST",
    url: `https://www.olx.kz/api/partner/threads/${threadId}/messages`,
    data: {
      text,
    },
    headers: {
      "Content-Type": "application/json",
    },
  });

  return response.data;
}

function isIncomingMessage(message) {
  const type = String(message.type || message.direction || message.sender_type || "").toLowerCase();

  if (type.includes("incoming")) return true;
  if (type.includes("received")) return true;
  if (type.includes("buyer")) return true;
  if (type.includes("user")) return true;

  if (message.author && message.author.type) {
    const authorType = String(message.author.type).toLowerCase();
    if (authorType.includes("buyer")) return true;
  }

  return false;
}

function getMessageId(message) {
  return message.id || message.message_id || message.uuid;
}

function getMessageText(message) {
  return message.text || message.body || message.message || "";
}

function getClientName(thread, messages = []) {
  const possibleThreadNames = [
    thread?.interlocutor?.name,
    thread?.interlocutor?.display_name,
    thread?.interlocutor?.username,
    thread?.buyer?.name,
    thread?.buyer?.display_name,
    thread?.user?.name,
    thread?.user?.display_name,
    thread?.client?.name,
    thread?.client?.display_name,
    thread?.name,
    thread?.title,
  ];

  for (const name of possibleThreadNames) {
    if (name && String(name).trim()) {
      return String(name).trim();
    }
  }

  for (const msg of messages) {
    if (!isIncomingMessage(msg)) continue;

    const possibleMessageNames = [
      msg?.author?.name,
      msg?.author?.display_name,
      msg?.author?.username,
      msg?.sender?.name,
      msg?.sender?.display_name,
      msg?.user?.name,
      msg?.user?.display_name,
    ];

    for (const name of possibleMessageNames) {
      if (name && String(name).trim()) {
        return String(name).trim();
      }
    }
  }

  return "Имя не найдено";
}

function generateReply(messageText) {
  const text = String(messageText || "").toLowerCase();

  if (
    text.includes("актуально") ||
    text.includes("есть") ||
    text.includes("в наличии") ||
    text.includes("работает") ||
    text.includes("можно")
  ) {
    return "Здравствуйте! Товар актуален, отправьте пожалуйста запрос в телеграмм бота @ACCSELLERSteambot или напишите продавцу в Ватсап (номер указан в обьявлении), как освободится он обязательно ответит!";
  }

  if (
    text.includes("цена") ||
    text.includes("сколько") ||
    text.includes("почем") ||
    text.includes("почём") ||
    text.includes("стоимость") ||
    text.includes("прайс")
  ) {
    return "Здравствуйте! Цена рассчитывается индивидуально и зависит от нужного товара, объёма и условий. Напишите, пожалуйста, что именно вам нужно.";
  }

  if (
    text.includes("скидка") ||
    text.includes("дешевле") ||
    text.includes("торг") ||
    text.includes("уступ") ||
    text.includes("оптом")
  ) {
    return "Здравствуйте! Цена индивидуальная, при объёме можем обсудить выгоднее. Напишите, пожалуйста, что именно и в каком количестве вам нужно.";
  }

  if (
    text.includes("доставка") ||
    text.includes("самовывоз") ||
    text.includes("где забрать") ||
    text.includes("адрес") ||
    text.includes("курьер")
  ) {
    return "Здравствуйте! Это цифровой товар, доставка и самовывоз не нужны. После согласования всё передаётся онлайн.";
  }

  if (
    text.includes("как получить") ||
    text.includes("как передаете") ||
    text.includes("как передаёте") ||
    text.includes("как выдаете") ||
    text.includes("как выдаёте") ||
    text.includes("онлайн")
  ) {
    return "Здравствуйте! Всё передаётся онлайн после согласования деталей. Напишите, пожалуйста, что именно вам нужно, и я объясню порядок.";
  }

  if (
    text.includes("оплата") ||
    text.includes("оплатить") ||
    text.includes("kaspi") ||
    text.includes("каспи") ||
    text.includes("перевод")
  ) {
    return "Здравствуйте! По оплате договоримся после уточнения товара и суммы. Напишите, пожалуйста, что именно вам нужно.";
  }

  if (
    text.includes("гарантия") ||
    text.includes("безопасно") ||
    text.includes("обман") ||
    text.includes("кидалово") ||
    text.includes("проверка")
  ) {
    return "Здравствуйте! Понимаю ваш вопрос. Сначала уточним, что именно вам нужно, после этого я объясню условия и порядок получения.";
  }

  if (
    text.includes("номер") ||
    text.includes("телефон") ||
    text.includes("ватсап") ||
    text.includes("whatsapp") ||
    text.includes("wa")
  ) {
    return "Здравствуйте! Давайте сначала уточним детали здесь в чате OLX: что именно вам нужно и в каком объёме?";
  }

  return "Здравствуйте! Напишите, пожалуйста, что именно вам нужно: название цифрового товара/услуги, объём и желаемые условия. После этого я подскажу варианты и цену.";
}

function isLeadReady(replyText) {
  const text = String(replyText || "").toLowerCase();

  return (
    text.includes("продавец уточнит") ||
    text.includes("уточнит наличие и цену") ||
    text.includes("передам продавцу") ||
    text.includes("сейчас продавец") ||
    text.includes("ожидайте, продавец")
  );
}

function isNewRequestAfterHandoff(clientText) {
  const text = String(clientText || "").toLowerCase();

  return (
    text.includes("еще") ||
    text.includes("ещё") ||
    text.includes("другой") ||
    text.includes("другая") ||
    text.includes("другое") ||
    text.includes("новый") ||
    text.includes("новая") ||
    text.includes("теперь") ||
    text.includes("а есть") ||
    text.includes("нужен") ||
    text.includes("нужна") ||
    text.includes("хочу") ||
    text.includes("интересует") ||
    text.includes("steam") ||
    text.includes("epic") ||
    text.includes("chatgpt") ||
    text.includes("чатгпт") ||
    text.includes("яндекс") ||
    text.includes("плюс") ||
    text.includes("подписка") ||
    text.includes("аккаунт")
  );
}

function printLead(threadId, clientText, replyText) {
  console.log("\n==============================");
  console.log("🔥 НОВАЯ ЗАЯВКА OLX");
  console.log("==============================");
  console.log(`Диалог: ${threadId}`);
  console.log("");
  console.log("Сообщения клиента:");
  console.log(clientText || "Нет текста");
  console.log("");
  console.log("Ответ бота:");
  console.log(replyText || "Нет ответа");
  console.log("==============================\n");
}

async function sendTelegramLead(
  threadId,
  clientText,
  replyText,
  title = "🔥 НОВАЯ ЗАЯВКА OLX",
  clientName = "Имя не найдено"
) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
    console.log("Telegram не настроен: нет TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID");
    return;
  }

  const baseUrl = process.env.PUBLIC_BASE_URL || "";

  const message = `
${title}

Клиент: ${clientName}
Диалог: ${threadId}

Сообщения клиента:
${clientText || "Нет текста"}

Ответ бота:
${replyText || "Нет ответа"}

${baseUrl ? `Ссылка на сообщения: ${baseUrl}/olx/messages/${threadId}` : ""}
`.trim();

  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message.slice(0, 4000),
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "✅ Прочитано",
                callback_data: `read:${threadId}`,
              },
              {
                text: "👀 Оставить непрочитанным",
                callback_data: `unread:${threadId}`,
              },
            ],
            [
              {
                text: "📘 Скинуть инструкции",
                callback_data: `instructions:${threadId}`,
              },
            ],
            [
              {
                text: "🔄 Начать заново",
                callback_data: `reset:${threadId}`,
              },
            ],
          ],
        },
      }
    );

    readThreads.delete(String(threadId));
    saveReadThreads();

    console.log("Telegram-уведомление отправлено ✅");
  } catch (error) {
    console.error("Ошибка Telegram:", error.response?.data || error.message);
  }
}

app.post("/tg/webhook", async (req, res) => {
  try {
    const message = req.body.message;

    // Ответ в Telegram свайпом/Reply на уведомление.
    // Этот текст отправится прямо в нужный OLX-диалог.
    // Gemini при этом НЕ используется.
    if (message && message.text && message.reply_to_message) {
      const replyText = String(message.text || "").trim();
      const originalText = String(message.reply_to_message.text || "");

      const match = originalText.match(/Диалог:\s*(\d+)/);

      if (!match) {
        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: message.chat.id,
            text: "⚠️ Не нашёл номер диалога. Ответьте именно на уведомление бота, где есть строка «Диалог: ...».",
          }
        );

        return res.sendStatus(200);
      }

      const threadId = match[1];

      if (!replyText) {
        return res.sendStatus(200);
      }

      try {
        await sendMessage(threadId, replyText);

        // После твоего ручного ответа диалог считается переданным продавцу.
        // Дальше бот сам не отвечает, а только присылает новые сообщения в Telegram.
        handoffThreads.add(String(threadId));
        readThreads.add(String(threadId));
        saveHandoffThreads();
        saveReadThreads();

        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: message.chat.id,
            text: `✅ Ответ отправлен в OLX\n\nДиалог: ${threadId}\n\nТекст:\n${replyText}`,
          }
        );

        console.log(`Ответ из Telegram отправлен в OLX диалог ${threadId}: ${replyText}`);
      } catch (error) {
        console.error(
          "Ошибка отправки Telegram-ответа в OLX:",
          error.response?.data || error.message
        );

        await axios.post(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            chat_id: message.chat.id,
            text: `❌ Не получилось отправить ответ в OLX.\n\nДиалог: ${threadId}\n\nОшибка:\n${JSON.stringify(error.response?.data || error.message, null, 2).slice(0, 1500)}`,
          }
        );
      }

      return res.sendStatus(200);
    }

    const callback = req.body.callback_query;

    if (!callback) {
      return res.sendStatus(200);
    }

    const data = callback.data || "";
    const threadId = data.split(":")[1];

    if (!threadId) {
      return res.sendStatus(200);
    }

    if (data.startsWith("read:")) {
      readThreads.add(String(threadId));
      saveReadThreads();

      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
        {
          callback_query_id: callback.id,
          text: "Отмечено как прочитано ✅",
        }
      );
    }

    if (data.startsWith("unread:")) {
      readThreads.delete(String(threadId));
      saveReadThreads();

      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
        {
          callback_query_id: callback.id,
          text: "Оставлено непрочитанным 👀",
        }
      );
    }

    if (data.startsWith("instructions:")) {
  instructionsThreads.add(String(threadId));
  saveInstructionsThreads();

  try {
    await sendMessage(threadId, INSTRUCTIONS_PROMPT_TEXT);

    handoffThreads.add(String(threadId));
    readThreads.add(String(threadId));
    saveHandoffThreads();
    saveReadThreads();

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        callback_query_id: callback.id,
        text: "Инструкция-запрос отправлен клиенту ✅",
      }
    );

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: callback.message.chat.id,
        text: `✅ Клиенту отправлено сообщение:\n\n${INSTRUCTIONS_PROMPT_TEXT}\n\nДиалог: ${threadId}`,
      }
    );
  } catch (error) {
    console.error("Ошибка отправки инструкции-запроса:", error.response?.data || error.message);

    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
      {
        callback_query_id: callback.id,
        text: "Не получилось отправить в OLX ❌",
      }
    );
  }
}

    if (data.startsWith("reset:")) {
      handoffThreads.delete(String(threadId));
      readThreads.delete(String(threadId));
      saveHandoffThreads();
      saveReadThreads();

      await axios.post(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`,
        {
          callback_query_id: callback.id,
          text: "Диалог снова активен для автоответчика 🔄",
        }
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("Ошибка Telegram webhook:", error.response?.data || error.message);
    return res.sendStatus(200);
  }
});
app.get("/tg/set-webhook", async (req, res) => {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.PUBLIC_BASE_URL) {
    return res.send("Нет TELEGRAM_BOT_TOKEN или PUBLIC_BASE_URL");
  }

  const webhookUrl = `${process.env.PUBLIC_BASE_URL}/tg/webhook`;

  try {
    const response = await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`,
      {
        url: webhookUrl,
      }
    );

    res.send(`
      <h1>Telegram webhook установлен ✅</h1>
      <pre>${JSON.stringify(response.data, null, 2)}</pre>
      <p>${webhookUrl}</p>
    `);
  } catch (error) {
    res.send(`
      <h1>Ошибка установки webhook ❌</h1>
      <pre>${JSON.stringify(error.response?.data || error.message, null, 2)}</pre>
    `);
  }
});

  
async function generateAIReply(messageText, conversationHistory = []) {
  const text = String(messageText || "").trim();

  const fallbackReply = generateReply(text);

  if (!process.env.GEMINI_API_KEY) {
    return {
      text: fallbackReply,
      usedFallback: true,
      fallbackReason: "Нет GEMINI_API_KEY",
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite",
    });

    const historyText = conversationHistory
      .slice(-12)
      .map((msg) => {
        const role = isIncomingMessage(msg) ? "Клиент" : "Продавец";
        const msgText = getMessageText(msg);
        return `${role}: ${msgText}`;
      })
      .filter((line) => line.trim() !== "Клиент:" && line.trim() !== "Продавец:")
      .join("\n");

    const prompt = `
Ты автоответчик-продавец в OLX Казахстан.

Магазин продаёт цифровые товары и онлайн-услуги:
- игровые аккаунты и игры, например Steam/Epic;
- аккаунты и доступы к сервисам;
- AI-сервисы, например ChatGPT;
- подписки, например Яндекс Плюс;
- другие цифровые товары.

Цены индивидуальные и зависят от категории, товара, срока, региона, типа аккаунта, комплектации и условий.

Твоя задача — не продать самостоятельно, а собрать заявку.

Для игр и игровых аккаунтов уточняй:
- какая игра;
- платформа, если не понятно: Steam, Epic или другое;
- полный аккаунт или доступ;
- нужны ли DLC/издание/комплектация.

Для ChatGPT / AI-сервисов уточняй:
- какой сервис нужен;
- нужен аккаунт или подписка;
- срок;
- личное использование или несколько пользователей.

Для Яндекс Плюс / подписок уточняй:
- какая подписка нужна;
- срок;
- регион/страна, если важно;
- один аккаунт или семейный вариант.

Для других цифровых товаров уточняй:
- что именно нужно;
- срок/объём;
- формат получения.

Когда заявка уже понятна, НЕ спрашивай дальше одно и то же.
Напиши коротко:
"Понял: [краткое резюме заявки]. Сейчас продавец уточнит наличие и цену."

ТВОЯ ГЛАВНАЯ ЗАДАЧА:
Не закрывать продажу самостоятельно.
Не называть цену.
Не обещать наличие.
Не выдумывать условия.
Твоя задача — собрать заявку от клиента и подготовить диалог для живого продавца.

Что нужно выяснить у клиента:
1. Какая игра нужна?
2. Какая платформа нужна? Например Steam, Epic Games или другая.
3. Нужен полный аккаунт или просто доступ?
4. Нужна обычная версия или с DLC/дополнениями?
5. Клиент хочет купить сейчас или просто интересуется?

Очень важные правила:
- Всегда учитывай историю переписки.
- Не спрашивай повторно то, что клиент уже написал.
- Если клиент уже назвал игру, не спрашивай игру снова.
- Если клиент уже написал "без DLC", "обычная версия", "просто доступ", "полный аккаунт" — учитывай это.
- Если данных ещё не хватает, задай только один самый важный уточняющий вопрос.
- Если данных уже достаточно, скажи, что понял заявку, и продавец сейчас уточнит наличие и цену.
- Никогда не называй конкретную цену.
- Никогда не говори "стоит 500", "от 1000", "примерно".
- Никогда не обещай, что товар точно есть.
- Не отправляй клиента в WhatsApp или Telegram первым.
- Не пиши длинные сообщения.
- Пиши естественно, как живой продавец.
- Пиши только на русском языке.
Если клиент пишет короткими сообщениями подряд, объединяй их в одну заявку.
Например:
"Cyberpunk 2077"
"без DLC"
"Steam аккаунт"
означает, что клиенту нужен Steam аккаунт с Cyberpunk 2077 без DLC.

Не спрашивай повторно то, что уже есть в истории.
Если уже понятны игра, DLC и тип аккаунта, не уточняй их заново.
Когда заявка достаточно понятна, напиши:
"Понял, нужен Steam аккаунт с Cyberpunk 2077 без DLC. Сейчас продавец уточнит наличие и цену."
- Ты обязан учитывать историю переписки.

Когда заявка считается достаточно собранной:
- известна игра;
- понятно, нужен полный аккаунт или доступ;
- понятно, нужна обычная версия или с DLC.

Если заявка собрана, ответь примерно так:
"Понял вас: [кратко повтори заявку]. Сейчас продавец уточнит наличие и цену."

История переписки:
${historyText}

Последнее сообщение клиента:
"${text}"

Ответь одним коротким сообщением от имени продавца.
`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();

    if (!reply) {
      return {
        text: fallbackReply,
        usedFallback: true,
        fallbackReason: "Gemini вернул пустой ответ",
      };
    }

    return {
      text: reply.slice(0, 700),
      usedFallback: false,
      fallbackReason: "",
    };
  } catch (error) {
    console.error("Ошибка Gemini:", error.message);

    return {
      text: fallbackReply,
      usedFallback: true,
      fallbackReason: error.message,
    };
  }
}

async function autoReplyOnce() {
  console.log("Проверяю новые сообщения OLX...");

  try {
    const threads = await getThreads();

    console.log(`Найдено диалогов: ${threads.length}`);

    for (const thread of threads) {
      const threadId = thread.id || thread.thread_id;

      if (!threadId) continue;

      let messages = await getMessages(threadId);

      if (!messages.length) continue;

      // Сортируем сообщения от старых к новым
      messages = messages.sort((a, b) => {
        const aTime = new Date(a.created_at || a.createdAt || a.date || 0).getTime();
        const bTime = new Date(b.created_at || b.createdAt || b.date || 0).getTime();
        return aTime - bTime;
      });

      // Первый запуск нужен только локально при ручном тесте.
      // На хостинге cron сам вызывает /olx/auto-reply-once,
      // поэтому не пропускаем новые сообщения как "старые".
      if (!autoreplyInitialized) {
        for (const msg of messages) {
          const oldMessageId = getMessageId(msg);
          if (oldMessageId) {
            processedMessages.add(oldMessageId);
          }
        }

        saveProcessedMessages();
        console.log(`Старые сообщения диалога ${threadId} запомнены без ответа`);
        continue;
      }

      // Берём все новые входящие сообщения клиента, на которые ещё не отвечали
      const newIncomingMessages = messages.filter((msg) => {
        const msgId = getMessageId(msg);
        return msgId && !processedMessages.has(msgId) && isIncomingMessage(msg);
      });

      if (!newIncomingMessages.length) {
        continue;
      }

      const combinedClientText = newIncomingMessages
        .map((msg) => getMessageText(msg))
        .filter(Boolean)
        .join("\n");
      const clientName = getClientName(thread, messages);
const normalizedClientText = String(combinedClientText || "").toLowerCase().trim();

if (normalizedClientText.includes("!инструкции")) {
  const instructionsWereOffered = messages.some((msg) =>
  !isIncomingMessage(msg) &&
  String(getMessageText(msg) || "").toLowerCase().includes("!инструкции")
);

if (instructionsThreads.has(String(threadId)) || instructionsWereOffered) {
    await sendMessage(threadId, STEAM_INSTRUCTIONS_TEXT);

    for (const msg of newIncomingMessages) {
      const msgId = getMessageId(msg);
      if (msgId) {
        processedMessages.add(msgId);
      }
    }

    saveProcessedMessages();

    console.log(`Инструкции отправлены в диалог ${threadId}`);
    continue;
  }

  for (const msg of newIncomingMessages) {
    const msgId = getMessageId(msg);
    if (msgId) {
      processedMessages.add(msgId);
    }
  }

  saveProcessedMessages();

  await sendTelegramLead(
    threadId,
    combinedClientText,
    "Клиент ввёл !инструкции, но инструкции не были разрешены кнопкой «Скинуть инструкции».",
    "⚠️ КЛИЕНТ ПРОСИТ ИНСТРУКЦИИ БЕЗ РАЗРЕШЕНИЯ",
    clientName
  );

  continue;
}

if (normalizedClientText.includes("!помощь")) {
  await sendTelegramLead(
    threadId,
    combinedClientText,
    "Клиент просит помощь. Нужно ответить вручную.",
    "🆘 КЛИЕНТ В ЧАТЕ ПРОСИТ ПОМОЩЬ",
    clientName
  );

  handoffThreads.add(String(threadId));
  saveHandoffThreads();

  for (const msg of newIncomingMessages) {
    const msgId = getMessageId(msg);
    if (msgId) {
      processedMessages.add(msgId);
    }
  }

  saveProcessedMessages();

  continue;
}

      // Если диалог уже передан продавцу
      if (handoffThreads.has(String(threadId))) {
        if (isNewRequestAfterHandoff(combinedClientText)) {
          console.log(`Диалог ${threadId}: похоже, клиент хочет новую заявку. Снимаю handoff.`);
          handoffThreads.delete(String(threadId));
          readThreads.delete(String(threadId));
          saveHandoffThreads();
          saveReadThreads();
        } else {
          console.log(`Диалог ${threadId} уже передан продавцу, но клиент написал ещё сообщение`);

         await sendTelegramLead(
  threadId,
  combinedClientText,
  "Клиент написал новое сообщение в уже переданном диалоге. Зайдите и ответьте вручную.",
  readThreads.has(String(threadId))
    ? "📩 НОВОЕ СООБЩЕНИЕ В ПРОЧИТАННОМ ДИАЛОГЕ"
    : "⚠️ ЕЩЁ ОДНО СООБЩЕНИЕ В НЕПРОЧИТАННОМ ДИАЛОГЕ",
  clientName
);

          for (const msg of newIncomingMessages) {
            const msgId = getMessageId(msg);
            if (msgId) {
              processedMessages.add(msgId);
            }
          }

          saveProcessedMessages();
          continue;
        }
      }

      console.log("Новые сообщения клиента:", {
        threadId,
        count: newIncomingMessages.length,
        text: combinedClientText,
      });

      const replyResult = await generateAIReply(combinedClientText, messages);
const replyText = replyResult.text;

await sendMessage(threadId, replyText);

if (replyResult.usedFallback) {
  await sendTelegramLead(
    threadId,
    combinedClientText,
    `Бот отправил шаблонный ответ, потому что Gemini недоступен или лимит закончился.\n\nПричина:\n${replyResult.fallbackReason}\n\nШаблонный ответ:\n${replyText}`,
    "⚠️ GEMINI НЕДОСТУПЕН — ОТПРАВЛЕН ШАБЛОН",
    clientName
  );

  console.log(`Gemini недоступен, отправлен шаблон и Telegram-уведомление по диалогу ${threadId}`);
}

      if (isLeadReady(replyText)) {
        handoffThreads.add(String(threadId));
        saveHandoffThreads();

        printLead(threadId, combinedClientText, replyText);
        await sendTelegramLead(threadId, combinedClientText, replyText, "🔥 НОВАЯ ЗАЯВКА OLX", clientName);

        console.log(`Диалог ${threadId} передан продавцу`);
      }

      // После одного ответа помечаем ВСЕ новые сообщения клиента как обработанные
      for (const msg of newIncomingMessages) {
        const msgId = getMessageId(msg);
        if (msgId) {
          processedMessages.add(msgId);
        }
      }

      saveProcessedMessages();

      console.log(`Автоответ отправлен в диалог ${threadId}`);
      console.log(`Ответ: ${replyText}`);
    }

    if (!autoreplyInitialized) {
      autoreplyInitialized = true;
      console.log("Автоответчик инициализирован. Старые сообщения больше не будут трогаться.");
    }
  } catch (error) {
    console.error("Ошибка автоответчика:", error.response?.data || error.message);
  }
}
app.get("/olx/auto-reply-once", async (req, res) => {
  await autoReplyOnce();

  res.send(`
    <h1>Проверка автоответчика выполнена ✅</h1>
    <p>Посмотри PowerShell.</p>
  `);
});

app.get("/olx/start-autoreply", async (req, res) => {
  if (global.autoreplyInterval) {
    return res.send(`
      <h1>Автоответчик уже запущен ✅</h1>
    `);
  }

  autoreplyInitialized = false;
  

  await autoReplyOnce();

  global.autoreplyInterval = setInterval(autoReplyOnce, 30000);

  res.send(`
    <h1>Автоответчик запущен ✅</h1>
    <p>Старые сообщения запомнены. Теперь бот будет отвечать только на новые сообщения.</p>
  `);
});

app.get("/olx/stop-autoreply", (req, res) => {
  if (global.autoreplyInterval) {
    clearInterval(global.autoreplyInterval);
    global.autoreplyInterval = null;
  }

  res.send(`
    <h1>Автоответчик остановлен ⛔</h1>
  `);
});

app.listen(process.env.PORT, () => {
  console.log(`Сервер запущен: http://localhost:${process.env.PORT}`);
});
