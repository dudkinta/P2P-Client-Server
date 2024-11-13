import { defineStore } from 'pinia';

export const useLogStore = defineStore('logs', {
    state: () => ({
        logs: [],
        services: new Map(),
        levels: new Map(),
    }),
    actions: {
        addLine(logLine) {
            this.logs.push(logLine);
            const service = logLine.service;
            const level = logLine.level;
            if (!this.services.has(service)) {
                this.services.set(service, true);
            }
            if (!this.levels.has(level)) {
                this.levels.set(level, true);
            }
        },
    },
});