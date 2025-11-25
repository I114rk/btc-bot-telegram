document.addEventListener('DOMContentLoaded', async () => {
    const instructionContent = document.getElementById('instruction-content');
    const langButtonsContainer = document.querySelector('.lang-selector');
    const botUsername = 'kruzhechka_dev'; // Замените на имя пользователя вашего бота!

    // Обновляем ссылку "Написать боту" в шапке
    const writeToBotLink = document.querySelector('header .btn-primary');
    if (writeToBotLink && botUsername) {
        writeToBotLink.href = `https://t.me/${botUsername}`;
    }

    const localesData = {};
    // Загружаем все локализации сразу
    const langFiles = ['ru_ru', 'en_us']; // В реальном приложении можно получить динамически с сервера
    for (const lang of langFiles) {
        try {
            const response = await fetch(`../langs/${lang}.json`);
            localesData[lang] = await response.json();
        } catch (error) {
            console.error(`Error loading ${lang}.json:`, error);
        }
    }

    // Генерируем кнопки выбора языка
    langButtonsContainer.innerHTML = '';
    for (const langCode in localesData) {
        const button = document.createElement('button');
        button.className = 'btn-secondary';
        button.dataset.lang = langCode;
        button.textContent = localesData[langCode].language_name;
        langButtonsContainer.appendChild(button);
    }

    const loadInstructions = async (lang) => {
        const data = localesData[lang];
        if (!data) {
            instructionContent.innerHTML = '<p>Failed to load instructions for this language.</p>';
            return;
        }
            
        let contentHTML = `<h3>${data.welcome}</h3>`;

        contentHTML += `<h4>${data.instruction} (для личных сообщений)</h4>`;
        contentHTML += `<p>${data.instruction_text_private}</p>`;

        contentHTML += `<h4>${data.instruction} (для групповых чатов)</h4>`;
        contentHTML += `<p>${data.instruction_text_group}</p>`;

        contentHTML += `<h4>Доступные параметры:</h4>`;
        contentHTML += `<ul>
            <li><b>Языки:</b> ${langFiles.map(l => localesData[l].language_name).join(', ')}</li>
            <li><b>Фиатные валюты:</b> RUB, USD, BOTH</li>
            <li><b>Криптовалюты:</b> BTC, ETH, USDT, SOL</li>
            <li><b>Периоды для графика:</b> 24h, 7d, 30d</li>
        </ul>`;

        instructionContent.innerHTML = contentHTML;
    };

    // Добавляем обработчики событий к новым кнопкам
    langButtonsContainer.addEventListener('click', (event) => {
        if (event.target.tagName === 'BUTTON') {
            const lang = event.target.dataset.lang;
            if (lang) {
                loadInstructions(lang);
            }
        }
    });

    // Загрузка инструкций по умолчанию (русский)
    loadInstructions('ru_ru');
});