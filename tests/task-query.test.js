import { describe, expect, it } from 'vitest';
import { filterTasks, summarizeTasks } from '../src/domain/task-query.js';

const tasks = [
  { id: 'TASK-1001', segmentName: '东城河 A 段', category: '塑料制品', risk: '高', status: '待派单', reporter: '林舟' },
  { id: 'TASK-1002', segmentName: '南浦支流', category: '泡沫', risk: '中', status: '处理中', reporter: '周宁' },
  { id: 'TASK-1003', segmentName: '西闸河', category: '生活垃圾', risk: '低', status: '已完成', reporter: '林舟' },
  { id: 'TASK-1004', segmentName: '东城河 B 段', category: '危险废弃物疑似', risk: '高', status: '待核查', reporter: '宋清' },
];

describe('task query', () => {
  it('combines keyword, risk and status filters using business-facing values', () => {
    expect(filterTasks(tasks, { keyword: '东城河', risk: '高', status: '待核查' }).map((task) => task.id)).toEqual([
      'TASK-1004',
    ]);
  });

  it('summarizes the work queue without treating completed reports as active work', () => {
    expect(summarizeTasks(tasks)).toEqual({
      total: 4,
      highRisk: 2,
      pendingReview: 1,
      active: 3,
    });
  });
});
