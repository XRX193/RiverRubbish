export const currentUser = {
  id: 'USR-007',
  name: '沈砚',
  username: 'shenyan',
  role: '调度员',
  initials: '沈',
};

export const riverSegments = [
  { id: 'SEG-01', code: 'DC-A', name: '东城河 A 段', area: '上城区', status: '启用', tasks: 34 },
  { id: 'SEG-02', code: 'DC-B', name: '东城河 B 段', area: '上城区', status: '启用', tasks: 22 },
  { id: 'SEG-03', code: 'NP-01', name: '南浦支流', area: '滨江区', status: '启用', tasks: 18 },
  { id: 'SEG-04', code: 'XZ-01', name: '西闸河', area: '拱墅区', status: '启用', tasks: 15 },
  { id: 'SEG-05', code: 'QP-02', name: '青平港', area: '临平区', status: '停用', tasks: 9 },
];

export const users = [
  { id: 'USR-001', name: '林舟', username: 'linzhou', role: '巡河员', status: '启用', workload: 3, lastActive: '8 分钟前' },
  { id: 'USR-002', name: '周宁', username: 'zhouning', role: '巡河员', status: '启用', workload: 2, lastActive: '24 分钟前' },
  { id: 'USR-003', name: '宋清', username: 'songqing', role: '巡河员', status: '启用', workload: 1, lastActive: '1 小时前' },
  { id: 'USR-004', name: '顾遥', username: 'guyao', role: '巡河员', status: '启用', workload: 4, lastActive: '昨天' },
  { id: 'USR-007', name: '沈砚', username: 'shenyan', role: '调度员', status: '启用', workload: 0, lastActive: '当前在线' },
  { id: 'USR-009', name: '陆川', username: 'luchuan', role: '管理员', status: '启用', workload: 0, lastActive: '35 分钟前' },
];

export const tasks = [
  {
    id: 'RW-20260902-0241',
    segmentId: 'SEG-02', segmentName: '东城河 B 段', location: '文晖桥北侧 120 m',
    category: '危险废弃物疑似', sourceCategory: 'chemical_container', confidence: 0.78,
    risk: '高', priority: '紧急', status: '待核查', stage: '人工复核', reporter: '宋清',
    capturedAt: '2026-09-02 16:22', updatedAt: '3 分钟前', lat: 30.2878, lng: 120.1761,
    count: 2, coverage: '8.4%', duplicate: false, due: '剩余 21 小时',
    summary: '河岸浅水区发现两只带警示标识的废弃容器，类别识别置信度不足以直接派单。',
    recommendation: '现场设置临时警戒，复核容器标签和是否存在泄漏后按危废流程转运。',
    image: '/assets/river-waste-evidence.jpg',
  },
  {
    id: 'RW-20260902-0238',
    segmentId: 'SEG-01', segmentName: '东城河 A 段', location: '庆春闸下游 260 m',
    category: '塑料制品', sourceCategory: 'plastic_bottle', confidence: 0.94,
    risk: '高', priority: '紧急', status: '待派单', stage: '分析完成', reporter: '林舟',
    capturedAt: '2026-09-02 15:46', updatedAt: '18 分钟前', lat: 30.2741, lng: 120.1551,
    count: 13, coverage: '31.2%', duplicate: true, due: '剩余 22 小时',
    summary: '拦污栅前聚集塑料瓶、包装袋等漂浮垃圾，覆盖范围较大并有继续汇集趋势。',
    recommendation: '优先安排小型清漂船当日清运，并同步检查上游排口和拦污设施。',
    image: '/assets/river-waste-evidence.jpg',
  },
  {
    id: 'RW-20260902-0233',
    segmentId: 'SEG-03', segmentName: '南浦支流', location: '江南大道涵洞口',
    category: '泡沫', sourceCategory: 'foam_box', confidence: 0.89,
    risk: '中', priority: '高', status: '清理中', stage: '现场处置', reporter: '周宁',
    capturedAt: '2026-09-02 14:10', updatedAt: '42 分钟前', lat: 30.1917, lng: 120.2054,
    count: 8, coverage: '18.7%', duplicate: false, due: '剩余 43 小时', assignee: '顾遥',
    summary: '涵洞口附近散落多块破碎泡沫，受水流影响可能继续向主河道扩散。',
    recommendation: '在下游设置临时拦截网，人工打捞碎片并袋装转运。', image: '/assets/river-waste-evidence.jpg',
  },
  {
    id: 'RW-20260902-0227',
    segmentId: 'SEG-04', segmentName: '西闸河', location: '和睦桥东南侧',
    category: '生活垃圾', sourceCategory: 'domestic_waste', confidence: 0.91,
    risk: '中', priority: '高', status: '待核验', stage: '清理核验', reporter: '林舟',
    capturedAt: '2026-09-02 11:38', updatedAt: '1 小时前', lat: 30.3156, lng: 120.1328,
    count: 6, coverage: '12.5%', duplicate: false, due: '提前完成', assignee: '周宁',
    summary: '河岸石缝内存在袋装生活垃圾，现场已完成清理并提交两张凭证。',
    recommendation: '核对清理范围与前后照片，确认无残留后通过核验。', image: '/assets/river-waste-evidence.jpg',
  },
  {
    id: 'RW-20260901-0219',
    segmentId: 'SEG-01', segmentName: '东城河 A 段', location: '望江公园亲水台',
    category: '渔业废弃物', sourceCategory: 'fishing_net', confidence: 0.96,
    risk: '高', priority: '紧急', status: '已派单', stage: '等待处置', reporter: '宋清',
    capturedAt: '2026-09-01 17:04', updatedAt: '2 小时前', lat: 30.2557, lng: 120.1717,
    count: 3, coverage: '25.1%', duplicate: false, due: '剩余 4 小时', assignee: '林舟',
    summary: '废弃渔网缠绕在亲水台下方护栏，存在水生动物缠绕和阻水风险。',
    recommendation: '两人配合拆除缠绕物，注意水下锐器并完整回收网具。', image: '/assets/river-waste-evidence.jpg',
  },
  {
    id: 'RW-20260901-0206',
    segmentId: 'SEG-03', segmentName: '南浦支流', location: '长河路箱涵上游',
    category: '塑料制品', sourceCategory: 'plastic_bag', confidence: 0.88,
    risk: '中', priority: '高', status: '已逾期', stage: '等待处置', reporter: '周宁',
    capturedAt: '2026-09-01 09:52', updatedAt: '5 小时前', lat: 30.2059, lng: 120.2016,
    count: 11, coverage: '19.3%', duplicate: true, due: '逾期 3 小时', assignee: '顾遥',
    summary: '箱涵上游漂浮塑料袋数量较多，已接近通水断面边缘。',
    recommendation: '立即复核现场水位并清理，处置后检查箱涵入口是否堵塞。', image: '/assets/river-waste-evidence.jpg',
  },
  {
    id: 'RW-20260831-0194',
    segmentId: 'SEG-02', segmentName: '东城河 B 段', location: '环城北路步道口',
    category: '漂浮植物/自然物', sourceCategory: 'floating_plant', confidence: 0.97,
    risk: '低', priority: '普通', status: '已完成', stage: '归档', reporter: '林舟',
    capturedAt: '2026-08-31 16:20', updatedAt: '昨天', lat: 30.2812, lng: 120.1637,
    count: 4, coverage: '6.1%', duplicate: false, due: '无需处置',
    summary: '少量自然漂浮植物，未形成聚集且不影响河道通行。',
    recommendation: '纳入常规巡查，无需单独派发处置单。', image: '/assets/river-waste-evidence.jpg',
  },
  {
    id: 'RW-20260831-0182',
    segmentId: 'SEG-04', segmentName: '西闸河', location: '运河交汇口',
    category: '生活垃圾', sourceCategory: 'domestic_waste', confidence: 0.93,
    risk: '中', priority: '高', status: '已清理', stage: '归档', reporter: '周宁',
    capturedAt: '2026-08-31 09:05', updatedAt: '昨天', lat: 30.3251, lng: 120.1452,
    count: 7, coverage: '15.4%', duplicate: false, due: '提前 7 小时', assignee: '宋清',
    summary: '交汇口缓流区有生活垃圾聚集，已完成打捞和岸线清扫。',
    recommendation: '处置已闭环，下次巡查重点关注同一缓流区。', image: '/assets/river-waste-evidence.jpg',
  },
];

export const weeklyTrend = {
  labels: ['08/27', '08/28', '08/29', '08/30', '08/31', '09/01', '09/02'],
  reports: [12, 16, 13, 19, 21, 24, 18],
  disposed: [8, 13, 12, 14, 18, 17, 15],
};

export const categoryStats = [
  { name: '塑料制品', value: 42, color: '#2dd4a7' },
  { name: '生活垃圾', value: 27, color: '#f0a03c' },
  { name: '泡沫', value: 16, color: '#38bdf8' },
  { name: '渔业废弃物', value: 9, color: '#a78bfa' },
  { name: '其他', value: 6, color: '#64748b' },
];

export const activities = [
  { time: '16:31', tone: 'amber', title: '高风险任务进入待核查', meta: 'RW-20260902-0241 · 宋清上报' },
  { time: '16:18', tone: 'green', title: '西闸河处置单提交核验', meta: '周宁 · 2 张清理凭证' },
  { time: '15:59', tone: 'red', title: '南浦支流处置单已逾期', meta: 'RW-20260901-0206 · 逾期 3 小时' },
  { time: '15:46', tone: 'teal', title: '东城河 A 段分析完成', meta: '13 个目标 · 塑料制品 · 高风险' },
];

export const integrations = [
  { name: '平台 FastAPI', detail: '/api · Cookie 会话', status: '正常', latency: '38 ms', tone: 'green' },
  { name: '垃圾识别 FastAPI', detail: '/process · Bearer（服务器端）', status: '正常', latency: '1.8 s', tone: 'green' },
  { name: 'Sub2 大模型', detail: '/v1/chat/completions · 服务器端', status: '正常', latency: '2.4 s', tone: 'green' },
  { name: '任务 Worker', detail: '单进程 · 租约 10 分钟', status: '运行中', latency: '队列 2', tone: 'teal' },
];
