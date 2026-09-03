const COMPLETED_STATUSES = new Set(['已完成', '已清理', '已取消']);

export function filterTasks(tasks, filters = {}) {
  const keyword = filters.keyword?.trim().toLocaleLowerCase('zh-CN') || '';

  return tasks.filter((task) => {
    const searchable = [task.id, task.segmentName, task.category, task.reporter]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('zh-CN');

    return (
      (!keyword || searchable.includes(keyword)) &&
      (!filters.risk || task.risk === filters.risk) &&
      (!filters.status || task.status === filters.status) &&
      (!filters.category || task.category === filters.category)
    );
  });
}

export function summarizeTasks(tasks) {
  return tasks.reduce(
    (summary, task) => {
      summary.total += 1;
      if (task.risk === '高') summary.highRisk += 1;
      if (task.status === '待核查') summary.pendingReview += 1;
      if (!COMPLETED_STATUSES.has(task.status)) summary.active += 1;
      return summary;
    },
    { total: 0, highRisk: 0, pendingReview: 0, active: 0 },
  );
}
