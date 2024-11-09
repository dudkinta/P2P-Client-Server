import { Uint8ArrayList } from 'uint8arraylist';

export async function sendAndReceive(stream, message) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // Преобразуем исходное сообщение в Uint8Array
    const messageUint8Array = encoder.encode(message);

    // Создаем асинхронный генератор для передачи данных в поток
    async function* messageGenerator() {
        yield messageUint8Array;
    }

    // Отправляем данные в поток через sink
    const writePromise = stream.sink(messageGenerator());

    // Создаем экземпляр Uint8ArrayList для накопления входящих данных
    const receivedDataList = new Uint8ArrayList();

    // Читаем данные из потока через source
    for await (const chunk of stream.source) {
        // chunk может быть Uint8Array или Uint8ArrayList
        receivedDataList.append(chunk);
    }

    // Дожидаемся завершения записи
    await writePromise;

    // Получаем общий Uint8Array из списка
    const receivedData = receivedDataList.subarray();

    // Преобразуем полученные данные обратно в строку
    const receivedMessage = decoder.decode(receivedData);

    return receivedMessage;
}