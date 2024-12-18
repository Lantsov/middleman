
# Node.js Сервис для Агрегации Данных от Весов

Этот Node.js сервис предназначен для подключения к нескольким службам весов через WebSocket, агрегации данных и предоставления единого WebSocket-сервера для клиентов (например, Angular-приложения), который будет получать данные от всех весов в одном сообщении.
Опционально запускается HTTP сервер для получения данных разово POST запросом.

## Оглавление

- [Функциональность](#функциональность)
- [Требования](#требования)
- [Установка](#установка)
- [Настройка](#настройка)
- [Запуск](#запуск)
- [Структура проекта](#структура-проекта)
- [Логирование](#логирование)
- [Обработка ошибок и переподключение](#обработка-ошибок-и-переподключение)
- [Использование в клиентском приложении](#использование-в-клиентском-приложении)
- [Заключение](#заключение)

## Функциональность

- Подключается к нескольким службам весов по протоколу WebSocket.
- Агрегирует данные от всех подключенных весов.
- Предоставляет единый WebSocket-сервер для клиентов, к которому они могут подключаться и получать агрегированные данные.
- Отправляет данные клиентам в формате JSON раз в секунду.
- Ведет логирование событий и ошибок с помощью `winston` и `winston-daily-rotate-file`.
- Обрабатывает переподключение к службам весов с настройкой интервала и количества попыток.

## Требования

- [Node.js](https://nodejs.org/en/) версии 12 или выше.
- Пакеты NPM:
    - `ws` для работы с WebSocket.
    - `winston` и `winston-daily-rotate-file` для логирования.
    - `dotenv` для управления переменными окружения.

## Установка

1. **Клонируйте репозиторий или скопируйте файлы проекта:**

   ```bash
   git clone <URL вашего репозитория>
   ```

2. **Перейдите в директорию проекта:**

   ```bash
   cd middleman
   ```

3. **Установите зависимости:**

   ```bash
   npm install
   ```

## Настройка

1. **Создайте файл `.env` в корневой директории проекта и добавьте следующие переменные окружения:**

   ```
   WEIGHT_SERVICES=ws://localhost:8081,ws://localhost:8082
   PORT=3000
   LOG_LEVEL=info
   LOG_PATH=logs/
   RECONNECT_INTERVAL=60000
   RECONNECT_ATTEMPTS=120
   ```

    - `WEIGHT_SERVICES` — список URL служб весов, разделенных запятыми.
    - `PORT` — порт, на котором будет работать WebSocket-сервер для клиентов.
    - `LOG_LEVEL` — уровень логирования (`error`, `warn`, `info`, `debug`).
    - `LOG_PATH` — путь к директории для хранения логов.
    - `RECONNECT_INTERVAL` — интервал переподключения к службам весов в миллисекундах.
    - `RECONNECT_ATTEMPTS` — максимальное количество попыток переподключения (установите `0` для бесконечных попыток).

2. **Пример `.env` файла:**

   ```
   WEIGHT_SERVICES=ws://localhost:32281/api/ws/weight,ws://localhost:32282/api/ws/weight
   PORT=3000
   LOG_LEVEL=info
   LOG_PATH=logs/
   RECONNECT_INTERVAL=60000
   RECONNECT_ATTEMPTS=120
   ```

## Запуск

1. **Запустите сервер:**

   ```bash
   node server.js
   ```

2. **Либо используйте `nodemon` для автоматической перезагрузки при изменениях:**

   ```bash
   npx nodemon server.js
   ```

3. **Сервер запустится и начнет подключаться к указанным службам весов. Логи будут отображаться в консоли и записываться в файлы логов.**

## Структура проекта

```
your-project/
├── server.js
├── package.json
├── package-lock.json
├── .env
├── logs/
│   ├── 2024-10-15.log
│   ├── 2024-10-16.log
│   └── ...
```

- **server.js** — основной файл сервера.
- **package.json** — файл с информацией о проекте и зависимостях.
- **.env** — файл с переменными окружения.
- **logs/** — директория для хранения лог-файлов.

## Логирование

- Используется библиотека `winston` с транспортом `winston-daily-rotate-file` для ротации логов по дням.
- Логи хранятся в директории, указанной в переменной окружения `LOG_PATH` (по умолчанию `logs/`).
- Формат логов:

  ```
  YYYY-MM-DD HH:mm:ss [LEVEL]: Сообщение
  ```

- Пример:

  ```
  2024-10-15 17:30:01 [INFO]: WebSocket сервер запущен на порту 3000
  2024-10-15 17:30:01 [INFO]: Подключено к весам по адресу ws://localhost:8081
  2024-10-15 17:30:01 [ERROR]: Ошибка в соединении с весами ws://localhost:8082: Connection refused
  ```

## Обработка ошибок и переподключение

- При разрыве соединения с службой весов сервис пытается переподключиться через интервал, указанный в `RECONNECT_INTERVAL`.
- Максимальное количество попыток переподключения определяется переменной `RECONNECT_ATTEMPTS`. Если установить `0`, попытки будут бесконечными.
- При успешном подключении счётчик попыток переподключения сбрасывается.
- Логи переподключений записываются для мониторинга состояния соединений.

## Использование в клиентском приложении

Клиентское приложение (например, Angular) может подключиться к данному сервису и получать агрегированные данные от всех весов.

### Пример подключения в Angular:

```typescript
import { WebSocketSubject } from 'rxjs/webSocket';

const socket$ = new WebSocketSubject('ws://localhost:3000');

socket$.subscribe(
  (message) => {
    console.log('Получены данные:', message);
    // Обработка полученных данных
  },
  (err) => console.error(err),
  () => console.warn('Соединение закрыто')
);
```

### Формат получаемых данных

Клиент будет получать данные в следующем формате:

```json
{
  "1": {
    "WeightNet": 112.407,
    "WeightGross": 112.407,
    "Status": "OK",
    "DeviceMessage": null
  },
  "2": {
    "WeightNet": 98.123,
    "WeightGross": 98.123,
    "Status": "OK",
    "DeviceMessage": null
  },
  "3": {
    "WeightNet": null,
    "WeightGross": null,
    "Status": "Not connected",
    "DeviceMessage": null
  }
}
```

- Ключи `"1"`, `"2"`, `"3"` — это идентификаторы весов.
- Значения — объекты `Event`, содержащие данные каждого веса.

### Типы данных

```typescript
export interface Event {
  WeightNet?: number | string;
  WeightGross?: number | string;
  Status: EventStatus;
  DeviceMessage?: string | null;
}

export enum EventStatus {
  OK = 'OK',
  NoConnection = 'No connection',
  Overload = 'Overload',
  Unstable = 'Unstable',
  Other = 'Other',
}
```

## Заключение

Данный сервис облегчает работу с множеством служб весов, агрегируя данные и предоставляя удобный интерфейс для клиентских приложений. Логирование и обработка ошибок делают сервис надежным и удобным для сопровождения.

Если у вас возникнут вопросы или потребуется дополнительная информация, пожалуйста, обратитесь к документации или свяжитесь с разработчиками.

## Дополнительная информация

### Настройка интервала отправки данных клиентам

По умолчанию сервис отправляет агрегированные данные клиентам раз в секунду. Если вы хотите изменить этот интервал:

1. Найдите в `server.js` следующую строку:

   ```javascript
   setInterval(broadcastAggregatedData, 1000); // Интервал в миллисекундах
   ```

2. Измените значение `1000` на желаемый интервал в миллисекундах.

### Безопасность и аутентификация

Данный сервис по умолчанию не реализует механизмов аутентификации или шифрования данных. Если требуется обеспечить безопасность передачи данных:

- Рассмотрите возможность использования `wss://` для шифрования трафика с помощью SSL/TLS.
- Добавьте механизм аутентификации клиентов (например, с использованием токенов или API-ключей).

### Масштабируемость

- Если количество весов или подключений клиентов увеличится, можно оптимизировать сервис:
    - Использовать более продвинутые библиотеки для работы с WebSocket, такие как `socket.io`.
    - Реализовать кластеризацию Node.js для распределения нагрузки.
    - Использовать балансировщики нагрузки.

### Мониторинг и оповещения

- Для отслеживания состояния сервиса и своевременного обнаружения проблем рекомендуется настроить систему мониторинга.
- Можно использовать инструменты, такие как PM2, для управления процессами Node.js и сбора метрик.

---