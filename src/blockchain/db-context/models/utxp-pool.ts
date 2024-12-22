
import { injectable } from "inversify";
import { Output } from "./transaction.js";
import { Block } from "./block.js";

export class BlockDiff {
    public addedUTXOs: Map<string, Output> = new Map();
    public removedUTXOs: Map<string, Output> = new Map();
}

@injectable()
export class UTXOPool {
    private pool: Map<string, Output> = new Map();
    private activityMap: Map<string, number> = new Map(); // Хранение активности адресов
    public currentBlockHash: string | null = null;

    // Получение UTXO по ключу
    public getUTXO(txId: string, outputIndex: number): Output | undefined {
        const key = `${txId}:${outputIndex}`;
        return this.pool.get(key);
    }

    // Получение активности адреса
    public getActivity(address: string): number {
        return this.activityMap.get(address) || 0;
    }

    // Увеличение активности адреса
    private incrementActivity(address: string, amount: number = 1): void {
        const currentActivity = this.getActivity(address);
        this.activityMap.set(address, currentActivity + amount);
    }

    // Удаление активности адреса
    private decrementActivity(address: string, amount: number = 1): void {
        const currentActivity = this.getActivity(address);
        const newActivity = Math.max(0, currentActivity - amount);
        this.activityMap.set(address, newActivity);
    }

    // Добавление UTXO
    public addUTXO(txId: string, index: number, output: Output): void {
        const key = `${txId}:${index}`;
        this.pool.set(key, output);

        // Увеличиваем активность адреса, создающего output
        this.incrementActivity(output.address);
    }

    // Удаление UTXO
    public removeUTXO(txId: string, index: number): void {
        const key = `${txId}:${index}`;
        const utxo = this.pool.get(key);
        if (!utxo) {
            throw new Error(`UTXO ${key} not found.`);
        }
        this.pool.delete(key);

        // Уменьшаем активность адреса, чей UTXO тратится
        this.decrementActivity(utxo.address);
    }

    // Применение диффа
    public applyDiff(diff: BlockDiff): void {
        diff.addedUTXOs.forEach((output, key) => {
            this.addUTXO(key.split(":")[0], parseInt(key.split(":")[1]), output);
        });

        diff.removedUTXOs.forEach((_, key) => {
            this.removeUTXO(key.split(":")[0], parseInt(key.split(":")[1]));
        });
    }

    // Откат диффа
    public revertDiff(diff: BlockDiff): void {
        diff.removedUTXOs.forEach((utxo, key) => {
            this.addUTXO(key.split(":")[0], parseInt(key.split(":")[1]), utxo);
        });

        diff.addedUTXOs.forEach((output, key) => {
            this.removeUTXO(key.split(":")[0], parseInt(key.split(":")[1]));
        });
    }

    // Применение блока через дифф
    public applyBlockToUTXOPool(block: Block): void {
        // Генерация диффа для текущего блока
        const diff = block.generateDiff(this);
        this.applyDiff(diff); // Применение изменений
        this.currentBlockHash = block.hash; // Обновляем текущий хеш блока
    }
}