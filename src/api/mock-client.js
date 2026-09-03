import { activities, categoryStats, currentUser, integrations, riverSegments, tasks, users, weeklyTrend } from '../data/mock-data.js';

const delay = (value, milliseconds = 120) => new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), milliseconds));

export function createMockClient() {
  return {
    getBootstrap() {
      return delay({ currentUser, riverSegments, tasks, users, weeklyTrend, categoryStats, activities, integrations });
    },
    async createTask(payload) {
      await delay(null, 450);
      return { id: `RW-20260902-${String(tasks.length + 242).padStart(4, '0')}`, filename: payload.image.name };
    },
    async assignOrder(orderId, payload) {
      await delay(null, 240);
      return { id: orderId, ...payload, status: '已派单' };
    },
    async reviewTask(taskId, payload) {
      await delay(null, 240);
      return { id: taskId, ...payload, status: payload.decision === '确认有效' ? '待派单' : '已完成' };
    },
    testIntegration() {
      return delay({ ok: true, latency: 126 }, 600);
    },
  };
}
