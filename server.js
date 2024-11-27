require('dotenv').config();
const WebSocket = require('ws');
const winston = require('winston');
const express = require('express');
require('winston-daily-rotate-file');

const WEIGHT_SERVICES = process.env.WEIGHT_SERVICES.split(',');
const PORT = process.env.PORT || 3000;
const ENABLE_HTTP_SERVER = process.env.ENABLE_HTTP_SERVER === 'true';
const HTTP_PORT = process.env.HTTP_PORT || 4000;

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_PATH = process.env.LOG_PATH || 'logs/';

const RECONNECT_INTERVAL = process.env.RECONNECT_INTERVAL !== undefined ? Number(process.env.RECONNECT_INTERVAL) : 60000;
const RECONNECT_ATTEMPTS = process.env.RECONNECT_ATTEMPTS !== undefined ? Number(process.env.RECONNECT_ATTEMPTS) : 120;

// Настройка логирования
const transport = new winston.transports.DailyRotateFile({
  filename: `${LOG_PATH}%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d',
});

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.printf(
      (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    transport,
  ],
});

// Хранилище данных от весов (инициализируем пустыми данными для каждого весов)
const weightData = {};
WEIGHT_SERVICES.forEach((_, index) => {
  weightData[index + 1] = {
    "WeightNet": null,
    "WeightGross": null,
    "Status": "Not connected",
    "DeviceMessage": null,
  };
});

// Создаем WebSocket-сервер для Angular-приложения
const wss = new WebSocket.Server({ port: PORT }, () => {
  logger.info(`WebSocket сервер запущен на порту ${PORT}`);
});

// Обработка подключений от клиентов
wss.on('connection', (ws) => {
  logger.info('Клиент подключен');

  // При подключении отправляем текущее состояние весов
  ws.send(JSON.stringify(weightData));

  ws.on('close', () => {
    logger.info('Клиент отключен');
  });
});

// Функция для рассылки агрегированных данных всем подключенным клиентам раз в секунду
function broadcastAggregatedData() {
  const aggregatedData = JSON.stringify(weightData);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(aggregatedData);
    }
  });
}

// Запуск интервала для отправки агрегированных данных клиентам каждые 1 сек
setInterval(broadcastAggregatedData, 1000);

// Подключение к службам весов
WEIGHT_SERVICES.forEach((url, index) => {
  let ws;
  let isReconnecting = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = RECONNECT_ATTEMPTS === 0 ? Infinity : RECONNECT_ATTEMPTS;
  const reconnectInterval = RECONNECT_INTERVAL;

  function connect() {
    if (reconnectAttempts >= maxReconnectAttempts) {
      logger.error(`Превышено максимальное количество попыток подключения к весам по адресу ${url}. Переподключение остановлено.`);
      return;
    }

    isReconnecting = false;
    ws = new WebSocket(url.trim());

    ws.on('open', () => {
      reconnectAttempts = 0; // Сбросить счетчик попыток
      logger.info(`Подключено к весам по адресу ${url}`);
      weightData[index + 1].Status = 'Ok'; // Обновляем статус на 'Ok' при успешном подключении
    });

    ws.on('message', (data) => {
      try {
        weightData[index + 1] = JSON.parse(data);
        logger.debug(`Получены данные от ${url}: ${data}`);
      } catch (error) {
        logger.error(`Ошибка парсинга данных от весов ${url}: ${error.message}`);
      }
    });

    ws.on('close', () => {
      logger.warn(`Соединение с весами ${url} закрыто`);
      weightData[index + 1].Status = 'Not connected'; // Обновляем статус при закрытии соединения
      scheduleReconnect();
    });

    ws.on('error', (error) => {
      logger.error(`Ошибка в соединении с весами ${url}: ${error.message}`);
      ws.close(); // Закрываем соединение явно
    });
  }

  function scheduleReconnect() {
    if (!isReconnecting) {
      isReconnecting = true;
      reconnectAttempts++;
      logger.info(`Пытаемся переподключиться к весам ${url} через ${reconnectInterval / 1000} секунд... (Попытка ${reconnectAttempts}/${maxReconnectAttempts})`);
      setTimeout(connect, reconnectInterval);
    }
  }

  connect();
});

// Проверка и запуск HTTP-сервера
if (ENABLE_HTTP_SERVER) {
  const app = express();

  // Подключение JSON-парсера
  app.use(express.json());

  // Маршрут для получения данных
  app.post('/weight', (req, res) => {
    const { path } = req.body;
    if (!path) {
      logger.warn('В BODY HTTP запроса не указан путь до целевых весов');
      return res.status(400).json({ error: 'Не указан путь до целевых весов' });
    }

    let index = WEIGHT_SERVICES.indexOf(path);
    if (index >= 0) {
      index++;
    } else {
      logger.warn('Весы с указанным путем не зарегистрированы');
      return res.status(404).json({ error: 'Весы с указанным путем не зарегистрированы' });
    }

    res.json(weightData[index]);
  });

  app.listen(HTTP_PORT, () => {
    logger.info(`HTTP сервер запущен на порту ${HTTP_PORT}`);
  });
} else {
  logger.info('HTTP сервер отключен (ENABLE_HTTP_SERVER=false)');
}
