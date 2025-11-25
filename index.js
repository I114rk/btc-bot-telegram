require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const CoinGecko = require('coingecko-api');
const QuickChart = require('quickchart-js');
const fs = require('fs');
const path = require('path');

// --- Инициализация ---
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
    console.error('Ошибка: Токен Telegram не найден. Убедитесь, что вы создали файл .env и добавили в него TELEGRAM_BOT_TOKEN.');
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const coinGeckoClient = new CoinGecko();
let botName;
bot.getMe().then(me => {
    botName = me.username;
});

// --- Загрузка локализаций ---
const locales = {};
const localesDir = path.join(__dirname, 'langs');
fs.readdirSync(localesDir).forEach(file => {
    if (file.endsWith('.json')) {
        const lang = file.split('.')[0];
        locales[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
    }
});

const t = (lang, key) => locales[lang] ? (locales[lang][key] || key) : key;


// --- Данные и Emojis ---
const CRYPTO_CURRENCIES = {
    'BTC': { name: 'Bitcoin', emoji: '₿' },
    'ETH': { name: 'Ethereum', emoji: '♦️' },
    'USDT': { name: 'Tether', emoji: '₮' },
    'SOL': { name: 'Solana', emoji: '☀️' }, // Заменено TON на SOL
};

const FIAT_CURRENCIES = {
    'USD': { name: 'Доллар США', symbol: '$', emoji: '🇺🇸' },
    'RUB': { name: 'Российский рубль', symbol: '₽', emoji: '🇷🇺' },
};

// --- Клавиатуры ---

const generateLanguageMenu = () => {
    const keyboard = Object.keys(locales).map(lang => ({
        text: locales[lang].language_name,
        callback_data: `lang_${lang}`
    }));
    return { reply_markup: { inline_keyboard: [keyboard] } };
};

const chartPeriodMenu = (lang) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: t(lang, 'chart_24h'), callback_data: 'period_1' }, { text: t(lang, 'chart_7d'), callback_data: 'period_7' }, { text: t(lang, 'chart_30d'), callback_data: 'period_30' }]
        ],
    },
});

const fiatCurrencyMenu = (lang) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: t(lang, 'fiat_rub'), callback_data: 'fiat_RUB' }, { text: t(lang, 'fiat_usd'), callback_data: 'fiat_USD' }],
            [{ text: t(lang, 'fiat_both'), callback_data: 'fiat_BOTH' }]
        ],
    },
});

const cryptoCurrencyMenu = (lang) => ({
    reply_markup: {
        inline_keyboard: [
            [{ text: t(lang, 'crypto_btc'), callback_data: 'crypto_BTC' }, { text: t(lang, 'crypto_eth'), callback_data: 'crypto_ETH' }],
            [{ text: t(lang, 'crypto_usdt'), callback_data: 'crypto_USDT' }, { text: t(lang, 'crypto_sol'), callback_data: 'crypto_SOL' }], // Обновлено: TON на SOL
            [{ text: t(lang, 'back_to_fiat'), callback_data: 'back_fiat' }]
        ],
    },
});

const mainMenu = (lang, chatType) => {
    const buttons = [
        [{ text: t(lang, 'get_currency_rate'), callback_data: 'main_getPrice' }],
        [{ text: t(lang, 'settings'), callback_data: 'main_settings' }],
        [{ text: t(lang, 'tg_channel'), url: 'https://t.me/kruzhechka_dev' }]
    ];
    if (chatType === 'private') {
        buttons.splice(1, 0, [{ text: t(lang, 'instruction'), callback_data: 'main_instruction' }]);
    }
    return { reply_markup: { inline_keyboard: buttons } };
};

const backToMenuButton = (lang) => ({
    reply_markup: {
        inline_keyboard: [[{ text: t(lang, 'back_to_menu'), callback_data: 'main_menu' }]]
    }
});


// --- Обработчики команд ---

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `${locales['ru_ru']['select_language']}
${locales['en_us']['select_language']}`, generateLanguageMenu());
});

bot.onText(/\/menu/, (msg) => {
    const chatId = msg.chat.id;
    const lang = userSelections[chatId]?.lang || 'ru_ru';
    bot.sendMessage(chatId, t(lang, 'welcome'), mainMenu(lang, msg.chat.type));
});

bot.on('new_chat_members', (msg) => {
    const chatId = msg.chat.id;
    const lang = userSelections[chatId]?.lang || 'ru_ru';
    msg.new_chat_members.forEach((member) => {
        if (member.username === botName) {
            bot.sendMessage(chatId, `${t(lang, 'welcome_group')}

${t(lang, 'instruction_text_group')}`);
        }
    });
});

bot.onText(/\/getcrypto (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const defaultLang = userSelections[chatId]?.lang || 'ru_ru';
    const args = match[1].split(/\s+/);

    if (args.length !== 4) {
        return bot.sendMessage(chatId, `Usage: /getcrypto <lang> <fiat> <crypto> <period>\nExample: /getcrypto en_us usd btc 7d`, backToMenuButton(defaultLang));
    }

    const [langArg, fiatArg, cryptoArg, periodArg] = args;

    if (!Object.keys(locales).includes(langArg)) {
        return bot.sendMessage(chatId, `Invalid language. Available: ${Object.keys(locales).join(', ')}`, backToMenuButton(defaultLang));
    }
    const fiat = fiatArg.toUpperCase();
    if (!Object.keys(FIAT_CURRENCIES).includes(fiat) && fiat !== 'BOTH') {
        return bot.sendMessage(chatId, `Invalid fiat currency. Available: ${Object.keys(FIAT_CURRENCIES).join(', ')}, or BOTH`, backToMenuButton(langArg));
    }
    const crypto = cryptoArg.toUpperCase();
    if (!Object.keys(CRYPTO_CURRENCIES).includes(crypto)) {
        return bot.sendMessage(chatId, `Invalid crypto currency. Available: ${Object.keys(CRYPTO_CURRENCIES).join(', ')}`, backToMenuButton(langArg));
    }
    const periodMap = { '24h': 1, '7d': 7, '30d': 30 };
    const days = periodMap[periodArg.toLowerCase()];
    if (!days) {
        return bot.sendMessage(chatId, `Invalid period. Available: 24h, 7d, 30d`, backToMenuButton(langArg));
    }

    await showPrice(chatId, null, crypto, fiat, langArg);
    await sendChart(chatId, crypto, fiat, days, langArg, null, false);
});


// --- Обработчик Callback'ов ---

const userSelections = {};

bot.on('callback_query', async (callbackQuery) => {
    bot.answerCallbackQuery(callbackQuery.id);
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;

    const [action, value, extra] = data.split('_');

    if (!userSelections[chatId]) userSelections[chatId] = { lang: 'ru_ru' };
    let lang = userSelections[chatId].lang;

    switch (action) {
        case 'lang':
            const newLang = `${value}_${extra}`;
            userSelections[chatId].lang = newLang;
            bot.editMessageText(t(newLang, 'select_period'), { chat_id: chatId, message_id: msg.message_id, ...chartPeriodMenu(newLang) });
            break;

        case 'period':
            userSelections[chatId].period = value;
            bot.editMessageText(t(lang, 'welcome'), { chat_id: chatId, message_id: msg.message_id, ...mainMenu(lang, msg.chat.type) });
            break;

        case 'main':
            if (value === 'getPrice') {
                bot.editMessageText(t(lang, 'select_fiat'), { chat_id: chatId, message_id: msg.message_id, ...fiatCurrencyMenu(lang) });
            } else if (value === 'settings') {
                bot.editMessageText(t(lang, 'select_language'), { chat_id: chatId, message_id: msg.message_id, ...generateLanguageMenu() });
            } else if (value === 'instruction') {
                await bot.deleteMessage(chatId, msg.message_id);
                await bot.sendMessage(chatId, t(lang, 'instruction_text_private'));
                await bot.sendMessage(chatId, t(lang, 'welcome'), mainMenu(lang, msg.chat.type));
            } else if (value === 'menu') {
                bot.editMessageText(t(lang, 'welcome'), { chat_id: chatId, message_id: msg.message_id, ...mainMenu(lang, msg.chat.type) });
            }
            break;

        case 'fiat':
            userSelections[chatId].fiat = value;
            bot.editMessageText(t(lang, 'select_crypto'), { chat_id: chatId, message_id: msg.message_id, ...cryptoCurrencyMenu(lang) });
            break;

        case 'crypto':
            userSelections[chatId].crypto = value;
            await showPrice(chatId, msg.message_id, value, userSelections[chatId].fiat, lang);
            break;

        case 'back':
            if (value === 'fiat') {
                bot.editMessageText(t(lang, 'select_fiat'), { chat_id: chatId, message_id: msg.message_id, ...fiatCurrencyMenu(lang) });
            } else if (value === 'crypto') {
                bot.editMessageText(t(lang, 'select_crypto'), { chat_id: chatId, message_id: msg.message_id, ...cryptoCurrencyMenu(lang) });
            }
            break;

        case 'chart':
            await sendChart(chatId, value, userSelections[chatId].fiat, userSelections[chatId].period, lang, msg.message_id, true);
            break;

        case 'price':
            userSelections[chatId].crypto = value;
            userSelections[chatId].fiat = extra;
            await bot.deleteMessage(chatId, msg.message_id);
            await showPrice(chatId, null, value, extra, lang);
            break;
    }
});

// --- Логика генерации и отправки графика ---
async function sendChart(chatId, crypto, fiat, days, lang, originalMessageId = null, showBackButton = true) {
    try {
        const cryptoId = CRYPTO_CURRENCIES[crypto].name.toLowerCase();
        const vsCurrency = fiat === 'BOTH' ? 'usd' : fiat.toLowerCase();

        const chartData = await coinGeckoClient.coins.fetchMarketChart(cryptoId, { vs_currency: vsCurrency, days });

        if (!chartData.data || !chartData.data.prices || chartData.data.prices.length === 0) { // Усиленная проверка
            return bot.sendMessage(chatId, t(lang, 'chart_no_data'), backToMenuButton(lang));
        }

        const dataPoints = chartData.data.prices.map(p => ({ x: p[0], y: p[1] }));
        const prices = dataPoints.map(p => p.y);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const currencySymbol = FIAT_CURRENCIES[fiat.toUpperCase()]?.symbol || vsCurrency.toUpperCase();

        const chart = new QuickChart();
        chart.setWidth(500).setHeight(300).setVersion('2.9.4');

        const xAxisConfig = { type: 'time', time: { displayFormats: { hour: 'HH:mm', day: 'MMM D' } }, ticks: { fontColor: "white" } };
        if (days <= 2) {
            xAxisConfig.time.unit = 'hour';
            xAxisConfig.time.stepSize = 3;
        } else {
            xAxisConfig.time.unit = 'day';
        }

        chart.setConfig({
            type: 'line',
            data: { datasets: [{ label: `${crypto} to ${vsCurrency.toUpperCase()}`, data: dataPoints, fill: false, borderColor: 'rgb(75, 192, 192)', tension: 0.1, pointRadius: 0 }] },
            options: {
                legend: { labels: { fontColor: "white" } },
                scales: { yAxes: [{ ticks: { fontColor: "white", callback: (value) => `${currencySymbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` } }], xAxes: [xAxisConfig] },
                plugins: {
                    annotation: {
                        annotations: [{
                            type: 'line', mode: 'horizontal', scaleID: 'y-axis-0', value: maxPrice, borderColor: 'rgba(0, 255, 0, 0.7)', borderWidth: 2, 
                            label: { enabled: true, position: "right", backgroundColor: 'rgba(0, 255, 0, 0.7)', content: `Peak: ${maxPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, fontColor: "white" }
                        }, {
                            type: 'line', mode: 'horizontal', scaleID: 'y-axis-0', value: minPrice, borderColor: 'rgba(255, 0, 0, 0.7)', borderWidth: 2, 
                            label: { enabled: true, position: "right", backgroundColor: 'rgba(255, 0, 0, 0.7)', content: `Low: ${minPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, fontColor: "white" }
                        }]
                    }
                }
            }
        });

        const chartUrl = await chart.getShortUrl();
        let options = {};
        if (showBackButton) {
            options.reply_markup = { inline_keyboard: [[{ text: t(lang, 'back_to_price'), callback_data: `price_${crypto}_${fiat}` }]] };
        }

        if (originalMessageId) await bot.deleteMessage(chatId, originalMessageId);
        await bot.sendPhoto(chatId, chartUrl, options);

    } catch (error) {
        console.error('Ошибка при создании графика:', error);
        await bot.sendMessage(chatId, t(lang, 'chart_fetch_error'), backToMenuButton(lang));
    }
}

// --- Логика получения и отображения цен ---
async function showPrice(chatId, messageId, crypto, fiat, lang) {
    try {
        const cryptoData = CRYPTO_CURRENCIES[crypto];
        if (!cryptoData) throw new Error('Invalid cryptocurrency provided.');
        
        const params = { ids: cryptoData.name.toLowerCase(), vs_currencies: fiat === 'BOTH' ? ['usd', 'rub'] : [fiat.toLowerCase()] };
        const response = await coinGeckoClient.simple.price(params);
        const priceData = response.data[cryptoData.name.toLowerCase()];

        if (!priceData) { // Усиленная проверка
            return bot.sendMessage(chatId, t(lang, 'price_fetch_error'), backToMenuButton(lang));
        }

        let messageText = `${cryptoData.emoji} *${cryptoData.name} (${crypto})*\n\n`;
        if (fiat === 'BOTH') {
            const usdPrice = Object.prototype.hasOwnProperty.call(priceData, 'usd') ? priceData.usd.toLocaleString('en-US') : 'N/A';
            const rubPrice = Object.prototype.hasOwnProperty.call(priceData, 'rub') ? priceData.rub.toLocaleString('ru-RU') : 'N/A';
            messageText += `🇺🇸 ${FIAT_CURRENCIES['USD'].symbol}${usdPrice}\n`;
            messageText += `🇷🇺 ${FIAT_CURRENCIES['RUB'].symbol}${rubPrice}\n`;
        } else {
            const fiatLower = fiat.toLowerCase();
            if (!Object.prototype.hasOwnProperty.call(priceData, fiatLower)) {
                return bot.sendMessage(chatId, t(lang, 'price_fetch_error'), backToMenuButton(lang));
            }
            const price = priceData[fiatLower];
            const fiatInfo = FIAT_CURRENCIES[fiat];
            messageText += `${fiatInfo.emoji} ${fiatInfo.symbol}${price.toLocaleString(fiat === 'USD' ? 'en-US' : 'ru-RU')}\n`;
        }
        
        const options = { 
            chat_id: chatId, 
            parse_mode: 'Markdown', 
            reply_markup: { 
                inline_keyboard: [
                    [{ text: t(lang, 'show_chart'), callback_data: `chart_${crypto}` }], 
                    [{ text: t(lang, 'back_to_crypto'), callback_data: 'back_crypto' }]
                ] 
            } 
        };

        if (messageId) {
            await bot.editMessageText(messageText, { ...options, message_id: messageId });
        } else {
            await bot.sendMessage(chatId, messageText, options);
        }

    } catch (error) {
        console.error('Ошибка при получении данных от CoinGecko:', error);
        const errorMessage = t(lang, 'price_fetch_error');
        if (messageId) {
            await bot.editMessageText(errorMessage, { chat_id: chatId, message_id: messageId, ...backToMenuButton(lang) });
        } else {
            await bot.sendMessage(chatId, errorMessage, backToMenuButton(lang));
        }
    }
}

// --- Обработчик ошибок ---
bot.on('polling_error', (error) => {
    console.log(`Polling error: ${error.code}`);
});

console.log('Бот запущен...');