const WebSocket = require('ws');
const path = require('path');
const { spawn } = require('child_process');
const waitForExpect = require('wait-for-expect');

// Увеличиваем таймаут для тестов
jest.setTimeout(60000); // 60 секунд

// Путь к вашему серверу
const SERVER_PATH = path.join(__dirname, '../server.js');

// Моки для служб весов
let weightServiceServers = [];
const weightServicePorts = [8081, 8082];
const weightServiceData = [
  { WeightNet: 100, WeightGross: 100, Status: 'OK', DeviceMessage: null },
  { WeightNet: 200, WeightGross: 200, Status: 'OK', DeviceMessage: null },
];

// Переменные для сервера и клиента
let serverProcess;
let clientWs;

beforeAll((done) => {
  // Запускаем моки служб весов
  weightServicePorts.forEach((port, index) => {
    const wss = new WebSocket.Server({ port }, () => {
      console.log(`Mock weight service running on port ${port}`);
    });

    wss.on('connection', (ws) => {
      console.log(`Client connected to mock weight service on port ${port}`);

      // Отправляем данные раз в секунду
      const interval = setInterval(() => {
        ws.send(JSON.stringify(weightServiceData[index]));
      }, 1000);

      ws.on('close', () => {
        clearInterval(interval);
      });
    });

    weightServiceServers.push(wss);
  });

  // Запускаем основной сервер
  serverProcess = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      WEIGHT_SERVICES: weightServicePorts
        .map((port) => `ws://localhost:${port}`)
        .join(','),
      PORT: 3001, // Используем другой порт для тестирования
      LOG_LEVEL: 'error', // Отключаем лишнее логирование
      LOG_PATH: 'logs/',
      RECONNECT_INTERVAL: 5000,
      RECONNECT_ATTEMPTS: 5,
    },
    stdio: ['pipe', 'pipe', 'pipe'], // Захватываем stdin, stdout и stderr
  });

  let serverStarted = false;

  // Ожидаем, пока сервер запустится
  serverProcess.stdout.on('data', (data) => {
    console.log(`Server stdout: ${data}`);
    if (data.toString().includes('WebSocket сервер запущен') || data.toString().includes('WebSocket server started')) {
      serverStarted = true;
      done();
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server stderr: ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error(`Failed to start server process: ${err}`);
    if (!serverStarted) {
      done(err);
    }
  });

  // В случае если сервер завершился с ошибкой
  serverProcess.on('exit', (code) => {
    if (!serverStarted) {
      done(new Error(`Server process exited with code ${code} before starting`));
    }
  });
});

afterAll(() => {
  // Останавливаем сервер и моки
  if (serverProcess) {
    serverProcess.kill();
  }

  weightServiceServers.forEach((wss) => {
    wss.close();
  });

  if (clientWs && clientWs.readyState === WebSocket.OPEN) {
    clientWs.close();
  }
});

test('Сервер агрегирует данные от весов и отправляет клиенту', async () => {
  // Подключаемся к серверу как клиент
  clientWs = new WebSocket('ws://localhost:3001');

  let receivedData = null;

  clientWs.on('message', (data) => {
    receivedData = JSON.parse(data);
  });

  // Ожидаем получения данных от сервера
  await waitForExpect(() => {
    expect(receivedData).not.toBeNull();
    expect(Object.keys(receivedData).length).toBe(2);
    expect(receivedData['1']).toEqual(weightServiceData[0]);
    expect(receivedData['2']).toEqual(weightServiceData[1]);
  }, 10000, 1000); // Проверяем каждые 1 сек в течение 10 сек
});

// Остальные тесты...
