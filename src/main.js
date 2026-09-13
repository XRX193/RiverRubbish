import './styles.css';
import { initCover } from './motion.js';
import 'leaflet/dist/leaflet.css';
import { Chart, registerables } from 'chart.js';
import L from 'leaflet';
import { createAmapMap, destroyAmapMap, preloadAmap, warmAmapTiles } from './map/amap-map.js';
import {
  Activity, ArrowRight, Bell, Bot, CalendarDays, Camera, ChartNoAxesColumnIncreasing,
  Check, ChevronLeft, ChevronRight, ChevronsUpDown, CircleAlert, CircleCheck,
  CircleCheckBig, ClipboardClock, ClipboardList, Clock3, CloudOff, CopyCheck, Cpu,
  Download, ExternalLink, FileCheck2, ImageUp, Info, LayoutDashboard,
  ListRestart, LoaderCircle, LocateFixed, LockKeyhole, Map, MapPin, Menu, Plus,
  PlugZap, RefreshCw, ScanLine, ScanSearch, ScrollText, Search, Send, Server,
  Settings, ShieldCheck, TriangleAlert, UploadCloud, UserRoundPlus, Users,
  Waves, X, createIcons,
} from 'lucide';
import { createPlatformClient } from './api/client.js';
import { createFastApiClient } from './api/fastapi-client.js';
import { createLlmClient } from './api/llm-client.js';
import { createMockClient } from './api/mock-client.js';
import { filterTasks, summarizeTasks } from './domain/task-query.js';
import { readExifCapturedAt, toDateTimeLocalValue, toDisplayValue } from './exif.js';

Chart.register(...registerables);

const icons = {
  Activity, ArrowRight, Bell, Bot, CalendarDays, Camera, ChartNoAxesColumnIncreasing,
  Check, ChevronLeft, ChevronRight, ChevronsUpDown, CircleAlert, CircleCheck,
  CircleCheckBig, ClipboardClock, ClipboardList, Clock3, CloudOff, CopyCheck, Cpu,
  Download, ExternalLink, FileCheck2, ImageUp, Info, LayoutDashboard,
  ListRestart, LoaderCircle, LocateFixed, LockKeyhole, Map, MapPin, Menu, Plus,
  PlugZap, RefreshCw, ScanLine, ScanSearch, ScrollText, Search, Send, Server,
  Settings, ShieldCheck, TriangleAlert, UploadCloud, UserRoundPlus, Users,
  Waves, X,
};

const apiMode = import.meta.env.VITE_API_MODE || 'fastapi';
const mockApi = createMockClient();
const api = apiMode === 'api'
  ? createPlatformClient({ baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL || '/api' })
  : apiMode === 'fastapi'
    ? createFastApiClient({
      baseUrl: import.meta.env.VITE_FASTAPI_BASE_URL || 'https://10776c44.r21.cpolar.top',
      processPath: import.meta.env.VITE_FASTAPI_PROCESS_PATH || '/process',
      fileField: import.meta.env.VITE_FASTAPI_FILE_FIELD || 'file',
      healthPath: import.meta.env.VITE_FASTAPI_HEALTH_PATH || '/health',
      bootstrapClient: mockApi,
    })
    : mockApi;
const llmMode = import.meta.env.VITE_LLM_MODE || 'proxy';
const llm = llmMode === 'off'
  ? null
  : createLlmClient({
    baseUrl: import.meta.env.VITE_LLM_PROXY_BASE_URL || import.meta.env.VITE_PLATFORM_API_BASE_URL || '/api',
    analyzePath: import.meta.env.VITE_LLM_ANALYZE_PATH || '/llm/analyze',
  });
const mapProvider = import.meta.env.VITE_MAP_PROVIDER || 'amap';
const amapKey = import.meta.env.VITE_AMAP_KEY || '';
const amapSecurityCode = import.meta.env.VITE_AMAP_SECURITY_CODE || '';
const DEFAULT_REPORT_LOCATION = Object.freeze({ latitude: 30.3145, longitude: 120.1406 });

const app = document.querySelector('#app');
const chartInstances = [];
let mapInstance = null;
let amapMapInstance = null;
let mapRenderToken = 0;
let selectedTaskId = null;

const state = {
  role: null, // 'admin' | 'patrol' | null（未选择 → 身份门户）
  view: 'dashboard',
  loading: true,
  navOpen: false,
  data: null,
  filters: { keyword: '', risk: '', status: '', category: '' },
  mapFilters: { segment: '', risk: '', status: '' },
  mapFocusTaskId: null,
  mapIntro: false, // 管理员进入时播放「全屏大地图 → 缩小回正常」入场
};

/* 管理员导航：不含「新建上报」，上报职责专属巡河员 */
const navItems = [
  { id: 'map', label: '河道地图', icon: 'map' },
  { id: 'dashboard', label: '调度总览', icon: 'layout-dashboard' },
  { id: 'tasks', label: '任务与处置', icon: 'clipboard-list', badge: '8' },
  { id: 'statistics', label: '数据统计', icon: 'chart-no-axes-column-increasing' },
  { id: 'admin', label: '系统管理', icon: 'settings' },
];

const viewMeta = {
  dashboard: ['调度总览', '聚焦异常、风险和待办，让处置节奏保持清晰。'],
  report: ['新建巡河上报', '一张照片建立一个识别任务，拍摄时间自动读取照片 EXIF。'],
  tasks: ['任务与处置', '查询分析任务，完成复核、派单、清理与核验闭环。'],
  map: ['河道态势地图', '按风险和处置状态查看已确认坐标的现场点位。'],
  statistics: ['数据统计', '观察上报趋势、垃圾构成与处置履约情况。'],
  admin: ['系统管理', '维护河段档案与仅服务端可见的模型集成状态。'],
};

/* 角色职责边界：
 * 管理员 —— 调度统筹：地图态势、复核、派单、统计与系统集成，不发起现场上报；
 * 巡河员 —— 一线执行：现场拍照上报，并跟踪本人上报任务的处置进度。 */
const roleNav = {
  admin: navItems,
  patrol: [
    { id: 'report', label: '现场上报', icon: 'upload-cloud' },
    { id: 'myTasks', label: '我的上报', icon: 'clipboard-list' },
  ],
};
viewMeta.myTasks = ['我的上报', '查看我上报的识别任务与处理进度。'];
const viewForRole = { admin: 'map', patrol: 'report' };
const isMobile = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile|Windows Phone/i.test(navigator.userAgent);

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function icon(name, size = 18) {
  return `<i data-lucide="${name}" width="${size}" height="${size}" aria-hidden="true"></i>`;
}

function statusTone(value) {
  if (['高', '紧急', '已逾期', '失败'].includes(value)) return 'danger';
  if (['中', '高', '待核查', '待派单', '待核验'].includes(value)) return 'warning';
  if (['低', '已完成', '已清理', '正常', '启用'].includes(value)) return 'success';
  if (['处理中', '清理中', '已派单', '运行中'].includes(value)) return 'info';
  return 'neutral';
}

function badge(value, extra = '') {
  return `<span class="badge badge-${statusTone(value)} ${extra}"><span class="badge-dot"></span>${esc(value)}</span>`;
}

function progressRing(value, label, color = '#2dd4a7') {
  return `<div class="progress-ring" style="--progress:${value * 3.6}deg;--ring-color:${color}">
    <div><strong>${value}%</strong><span>${label}</span></div>
  </div>`;
}

function shell(content) {
  const [title, subtitle] = viewMeta[state.view];
  const user = state.data?.currentUser;
  const isAdmin = state.role === 'admin';
  const nav = (roleNav[state.role] || navItems).map((item) => `
    <button class="nav-pill ${state.view === item.id ? 'active' : ''}" data-view="${item.id}" type="button" title="${item.label}">
      ${icon(item.icon, 15)}<span>${item.label}</span>${item.badge ? `<b>${item.badge}</b>` : ''}
    </button>`).join('');
  return `
    <div class="app-shell">
      <header class="top-nav">
        <div class="brand">
          <span class="brand-mark">${icon('waves', 21)}</span>
          <span class="brand-text"><strong>清川</strong><small>河道智治平台</small></span>
        </div>
        <nav class="top-nav-list" aria-label="主导航">${nav}</nav>
        <div class="top-nav-right">
          ${isAdmin ? `
            <div class="global-search">${icon('search', 16)}<input type="search" data-global-search placeholder="搜索任务、河段或人员" aria-label="全局搜索"/></div>
            <button class="icon-button" data-action="notifications" title="通知" aria-label="通知">${icon('bell')}<span></span></button>
            <span class="role-chip admin"><i class="pulse-dot"></i>管理员视图 · 调度统筹</span>`
          : `<span class="role-chip patrol"><i class="pulse-dot"></i>巡河员视图 · 现场上报</span>`}
          <label class="role-switch" title="切换身份视图">
            <span>${icon('chevrons-up-down', 13)}身份</span>
            <select data-role-switch aria-label="切换身份">
              <option value="admin" ${state.role === 'admin' ? 'selected' : ''}>管理员</option>
              <option value="patrol" ${state.role === 'patrol' ? 'selected' : ''}>巡河员</option>
            </select>
          </label>
          <div class="mini-user">
            <span class="avatar">${esc(user?.initials || (isAdmin ? '调' : '巡'))}</span>
            <span><strong>${esc(user?.name || (isAdmin ? '调度员' : '巡河员'))}</strong><small>${esc(user?.role || (isAdmin ? '平台管理员' : '现场巡河员'))}</small></span>
          </div>
        </div>
      </header>
      <main class="main-content">
        <div class="content-heading"><div><h1>${title}</h1><p>${subtitle}</p></div></div>
        ${content}
      </main>
    </div>
    <div id="overlay-root"></div>
    <div class="toast-region" aria-live="polite"></div>`;
}

function navItem(item) {
  return `<button class="nav-item ${state.view === item.id ? 'active' : ''}" data-view="${item.id}" type="button">
    <span>${item.label}</span>${item.badge ? `<b>${item.badge}</b>` : ''}
  </button>`;
}

function metricCard({ iconName, label, value, note, tone, trend = '' }) {
  return `<article class="metric-card">
    <div class="metric-top"><span class="metric-icon metric-${tone}">${icon(iconName, 19)}</span>${trend ? `<span class="metric-trend ${trend.startsWith('+') ? 'up' : ''}">${esc(trend)}</span>` : ''}</div>
    <p>${label}</p><strong>${value}</strong><small>${note}</small>
  </article>`;
}

function renderDashboard() {
  const { tasks, activities, riverSegments } = state.data;
  const summary = summarizeTasks(tasks);
  const urgent = tasks.filter((task) => !['已完成', '已清理'].includes(task.status)).slice(0, 5);
  return `
    <section class="metric-grid" aria-label="今日业务概览">
      ${metricCard({ iconName: 'scan-search', label: '今日上报', value: '18', note: '较昨日同期多 3 项', tone: 'teal', trend: '+20%' })}
      ${metricCard({ iconName: 'triangle-alert', label: '高风险任务', value: summary.highRisk, note: '2 项需在 24 小时内处置', tone: 'red', trend: '+2' })}
      ${metricCard({ iconName: 'clipboard-clock', label: '处置中', value: summary.active, note: '含 1 项已逾期', tone: 'amber' })}
      ${metricCard({ iconName: 'circle-check-big', label: '本月闭环率', value: '92.6%', note: '目标 90%，保持达标', tone: 'blue', trend: '+4.1%' })}
    </section>

    <section class="dashboard-grid">
      <div class="panel action-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">优先队列</span><h2>需要你关注的事项</h2></div>
          <button class="text-button" data-view="tasks">查看全部 ${icon('arrow-right', 16)}</button>
        </div>
        <div class="queue-list">
          ${urgent.map((task) => `
            <button class="queue-row" data-task-id="${task.id}" type="button">
              <span class="risk-stripe risk-${statusTone(task.risk)}"></span>
              <span class="queue-main"><strong>${esc(task.segmentName)}</strong><small>${esc(task.location)} · ${esc(task.category)}</small></span>
              <span class="queue-badges">${badge(task.risk)}${badge(task.status)}</span>
              <span class="queue-due ${task.due.includes('逾期') ? 'overdue' : ''}">${icon('clock-3', 14)}${esc(task.due)}</span>
              ${icon('chevron-right', 17)}
            </button>`).join('')}
        </div>
      </div>

      <aside class="panel river-health">
        <div class="panel-heading"><div><span class="eyebrow">河段态势</span><h2>巡查覆盖</h2></div><button class="icon-button" data-view="map" title="打开地图" aria-label="打开地图">${icon('map', 17)}</button></div>
        <div class="health-summary">${progressRing(87, '本周覆盖')}<div><strong>13 / 15</strong><span>重点河段已巡查</span><small>较上周提前 1.5 天</small></div></div>
        <div class="segment-bars">
          ${riverSegments.slice(0, 4).map((segment, index) => `<div class="segment-bar"><div><span>${esc(segment.name)}</span><small>${[96, 88, 74, 62][index]}%</small></div><progress value="${[96, 88, 74, 62][index]}" max="100"></progress></div>`).join('')}
        </div>
      </aside>
    </section>

    <section class="dashboard-lower">
      <div class="panel chart-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">近 7 日</span><h2>上报与闭环趋势</h2></div>
          <div class="legend"><span><i class="legend-report"></i>上报</span><span><i class="legend-done"></i>已闭环</span></div>
        </div>
        <div class="chart-wrap"><canvas id="trend-chart" aria-label="近七日上报与闭环趋势"></canvas></div>
      </div>
      <div class="panel activity-panel">
        <div class="panel-heading"><div><span class="eyebrow">实时动态</span><h2>最新业务事件</h2></div><button class="icon-button" title="刷新" aria-label="刷新">${icon('refresh-cw', 16)}</button></div>
        <ol class="activity-list">
          ${activities.map((item) => `<li><time>${item.time}</time><span class="activity-dot ${item.tone}"></span><div><strong>${esc(item.title)}</strong><small>${esc(item.meta)}</small></div></li>`).join('')}
        </ol>
      </div>
    </section>`;
}

function renderReport() {
  return `<section class="report-layout">
    <form class="panel report-form" id="report-form">
      <div class="form-intro"><span class="step-number">01</span><div><h2>现场照片</h2><p>支持 JPEG、PNG、WebP，单张不超过 10 MB。</p></div></div>
      <label class="upload-zone" id="upload-zone">
        <input type="file" id="report-image" accept="image/*" ${isMobile ? 'capture="environment" ' : ''}multiple required />
        <span class="upload-icon">${icon('camera', 26)}</span>
        <strong>拖放巡河照片到这里</strong><span>或点击现场拍照 / 选择照片</span>
        <small>系统会校验真实格式、文件大小与像素数</small>
      </label>
      <div id="file-preview" class="file-preview hidden"></div>
      <div class="form-divider"></div>
      <div class="form-intro"><span class="step-number">02</span><div><h2>河段与时间</h2><p>河段可自由输入，系统实时给出候选提示；拍摄时间自动读取照片 EXIF。</p></div></div>
      <div class="form-grid">
        <label class="segment-field"><span>所属河段 *</span>
          <input name="riverSegment" type="text" autocomplete="off" spellcheck="false" placeholder="输入河段名称，如：京杭大运河" required />
          <div class="segment-suggest hidden" role="listbox" aria-label="河段候选"></div>
        </label>
        <label><span>拍摄时间 <em>自动读取照片 EXIF</em></span>
          <input class="captured-display" type="text" value="选择照片后自动填入" readonly tabindex="-1" />
          <input name="capturedAt" type="hidden" />
        </label>
      </div>
      <div class="form-divider"></div>
      <div class="form-intro"><span class="step-number">03</span><div><h2>现场位置</h2><p>可使用照片坐标、当前定位或手动输入。</p></div></div>
      <div class="location-fields">
        <label><span>纬度</span><input name="latitude" inputmode="decimal" value="${DEFAULT_REPORT_LOCATION.latitude}" placeholder="例如 ${DEFAULT_REPORT_LOCATION.latitude}" /></label>
        <label><span>经度</span><input name="longitude" inputmode="decimal" value="${DEFAULT_REPORT_LOCATION.longitude}" placeholder="例如 ${DEFAULT_REPORT_LOCATION.longitude}" /></label>
        <button class="button button-secondary locate-button" type="button" data-action="locate">${icon('locate-fixed', 17)}当前定位</button>
      </div>
      <label class="full-field"><span>位置修改原因 <em>手动修改坐标时必填</em></span><input name="locationChangeReason" placeholder="例如：照片定位偏移，已按现场位置修正" /></label>
      <div class="form-footer"><p>${icon('shield-check', 16)} 原图仅暂存于受控目录，识别成功后立即删除</p><button class="button button-primary" type="submit">${icon('send', 17)}创建识别任务</button></div>
    </form>
    <aside class="report-aside">
      <div class="evidence-preview"><img src="/assets/river-waste-evidence.jpg" alt="河道漂浮垃圾现场示例"/><div><span>上报示例</span><strong>清晰包含水面与垃圾范围</strong></div></div>
      <div class="panel flow-panel"><span class="eyebrow">处理流程</span><h2>提交后自动流转</h2><ol><li class="active"><i>1</i><div><strong>文件安全校验</strong><span>格式、解码与像素检查</span></div></li><li><i>2</i><div><strong>远程智能识别</strong><span>服务端持有 API Key</span></div></li><li><i>3</i><div><strong>模型业务研判</strong><span>仅接收结构化结果</span></div></li><li><i>4</i><div><strong>自动进入处置</strong><span>中高风险自动建单</span></div></li></ol></div>
      <div class="privacy-note">${icon('lock-keyhole', 18)}<div><strong>密钥不会进入浏览器</strong><span>页面只访问平台 FastAPI，识别服务与 LLM Key 由服务器 Worker 注入。</span></div></div>
    </aside>
  </section>`;
}

function renderTasks() {
  const filtered = filterTasks(state.data.tasks, state.filters);
  return `<section class="panel task-workspace">
    <div class="task-toolbar">
      <div class="segmented" role="tablist"><button class="active">全部任务 <b>${state.data.tasks.length}</b></button><button>待复核 <b>1</b></button><button>处置单 <b>5</b></button></div>
      <div class="task-tools"><button class="button button-secondary">${icon('download', 16)}导出 CSV</button></div>
    </div>
    <div class="filter-bar">
      <label class="filter-search">${icon('search', 16)}<input data-filter="keyword" value="${esc(state.filters.keyword)}" placeholder="搜索任务编号、河段、人员" /></label>
      <select data-filter="risk"><option value="">全部风险</option>${['高', '中', '低'].map((value) => `<option ${state.filters.risk === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
      <select data-filter="status"><option value="">全部状态</option>${['待核查', '待派单', '已派单', '清理中', '待核验', '已逾期', '已完成', '已清理'].map((value) => `<option ${state.filters.status === value ? 'selected' : ''}>${value}</option>`).join('')}</select>
      <select data-filter="category"><option value="">全部类别</option>${[...new Set(state.data.tasks.map((task) => task.category))].map((value) => `<option ${state.filters.category === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>
      <button class="icon-button" data-action="reset-filters" title="清除筛选" aria-label="清除筛选">${icon('list-restart', 17)}</button>
    </div>
    <div class="table-scroll"><table class="data-table"><thead><tr><th>任务</th><th>识别结果</th><th>风险</th><th>流程状态</th><th>负责人 / 上报人</th><th>时限</th><th></th></tr></thead><tbody>
      ${filtered.map((task) => `<tr data-task-id="${task.id}" tabindex="0">
        <td><strong>${esc(task.id)}</strong><span>${esc(task.segmentName)} · ${esc(task.location)}</span><small>${esc(task.capturedAt)}</small></td>
        <td><strong>${esc(task.category)}</strong><span>${task.count} 个目标 · ${Math.round(task.confidence * 100)}% 置信度</span>${task.duplicate ? '<small class="duplicate-note">疑似重复点位</small>' : ''}</td>
        <td>${badge(task.risk)}<span class="priority-text">${esc(task.priority)}</span></td>
        <td>${badge(task.status)}<span>${esc(task.stage)}</span></td>
        <td><strong>${esc(task.assignee || '未指派')}</strong><span>上报：${esc(task.reporter)}</span></td>
        <td><span class="due-text ${task.due.includes('逾期') ? 'overdue' : ''}">${esc(task.due)}</span><small>${esc(task.updatedAt)}更新</small></td>
        <td><button class="icon-button row-action" data-task-id="${task.id}" title="查看任务" aria-label="查看任务">${icon('chevron-right', 17)}</button></td>
      </tr>`).join('')}
    </tbody></table></div>
    <div class="table-footer"><span>显示 ${filtered.length} / ${state.data.tasks.length} 项</span><div><button class="icon-button" disabled>${icon('chevron-left', 16)}</button><b>1</b><button class="icon-button" disabled>${icon('chevron-right', 16)}</button></div></div>
  </section>`;
}

function renderMap() {
  const visibleTasks = getMapTasks();
  const riskCount = (risk) => visibleTasks.filter((task) => task.risk === risk).length;
  return `<section class="map-workspace ${state.mapIntro ? 'map-intro' : ''}">
    <div class="map-toolbar panel">
      <div class="map-filter-group"><label>${icon('map-pin', 15)}<select data-map-filter="segment"><option value="">全部河段</option>${state.data.riverSegments.map((segment) => `<option value="${segment.id}" ${state.mapFilters.segment === segment.id ? 'selected' : ''}>${esc(segment.name)}</option>`).join('')}</select></label><label>${icon('triangle-alert', 15)}<select data-map-filter="risk"><option value="">全部风险</option><option value="高" ${state.mapFilters.risk === '高' ? 'selected' : ''}>高风险</option><option value="中" ${state.mapFilters.risk === '中' ? 'selected' : ''}>中风险</option><option value="低" ${state.mapFilters.risk === '低' ? 'selected' : ''}>低风险</option></select></label><label>${icon('clipboard-list', 15)}<select data-map-filter="status"><option value="">全部状态</option><option value="待处置" ${state.mapFilters.status === '待处置' ? 'selected' : ''}>待处置</option><option value="处置中" ${state.mapFilters.status === '处置中' ? 'selected' : ''}>处置中</option><option value="已闭环" ${state.mapFilters.status === '已闭环' ? 'selected' : ''}>已闭环</option></select></label></div>
      <div class="map-stats"><span><i class="map-dot high"></i>高风险 ${riskCount('高')}</span><span><i class="map-dot medium"></i>中风险 ${riskCount('中')}</span><span><i class="map-dot low"></i>低风险 ${riskCount('低')}</span></div>
    </div>
    <div class="map-frame"><div id="river-map" aria-label="河道任务地图"></div><div class="map-floating-summary"><span class="eyebrow">当前视图</span><strong>${visibleTasks.length} 个现场点位</strong><small>${visibleTasks.filter((task) => task.duplicate).length} 个疑似重复点位</small></div></div>
  </section>`;
}

function getMapTasks() {
  return state.data.tasks.filter((task) => task.lat != null && task.lng != null)
    .filter((task) => !state.mapFilters.segment || task.segmentId === state.mapFilters.segment)
    .filter((task) => !state.mapFilters.risk || task.risk === state.mapFilters.risk)
    .filter((task) => {
      if (!state.mapFilters.status) return true;
      if (state.mapFilters.status === '已闭环') return ['已完成', '已清理'].includes(task.status);
      if (state.mapFilters.status === '处置中') return ['已派单', '清理中', '待核验'].includes(task.status);
      return ['待核查', '待派单', '已逾期'].includes(task.status);
    });
}

/** 两点的近似球面距离（km），用于标点聚类。 */
function distanceKm(a, b) {
  const dLat = (a.lat - b.lat) * 111;
  const dLng = (a.lng - b.lng) * 111 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * 找出标点最密集的地段：以 2.2km 邻域做连通聚类，
 * 返回点数最多（并列时取更紧凑）的一簇的质心与包围盒。
 */
function densestCluster(tasks) {
  const points = (tasks || []).filter((task) => Number.isFinite(task.lat) && Number.isFinite(task.lng));
  if (!points.length) return null;
  const EPS_KM = 2.2;
  const parent = points.map((_, index) => index);
  const find = (i) => {
    let root = i;
    while (parent[root] !== root) root = parent[root];
    while (parent[i] !== root) { const next = parent[i]; parent[i] = root; i = next; }
    return root;
  };
  const union = (i, j) => { const a = find(i); const b = find(j); if (a !== b) parent[a] = b; };
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (distanceKm(points[i], points[j]) <= EPS_KM) union(i, j);
    }
  }
  const groups = new globalThis.Map(); // 注意：Map 已被 lucide 图标占用，需显式取全局构造器
  points.forEach((point, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(point);
  });
  /** @type {any} */
  let best = null;
  groups.forEach((group) => {
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) { sum += distanceKm(group[i], group[j]); pairs += 1; }
    }
    const tightness = pairs ? sum / pairs : 0;
    if (!best || group.length > best.group.length || (group.length === best.group.length && tightness < best.tightness)) {
      best = { group, tightness };
    }
  });
  if (!best || !best.group.length) return null;
  const count = best.group.length;
  return {
    count,
    lat: best.group.reduce((sum, task) => sum + task.lat, 0) / count,
    lng: best.group.reduce((sum, task) => sum + task.lng, 0) / count,
  };
}

/* ---------- 地图预加载（页面打开即开始） ---------- */
let mapSdkPreloaded = false;
let mapTilesWarmed = false;

/** 经纬度 → 指定缩放级别下的瓦片编号（Web Mercator）。 */
function lngLatToTile(lat, lng, zoom) {
  const n = 2 ** zoom;
  const latRad = lat * Math.PI / 180;
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n),
  };
}

/** 备用地图（Leaflet/CARTO）：预取密集地段与整体范围的瓦片。 */
function preloadLeafletTiles() {
  if (mapTilesWarmed) return;
  const tasks = (state.data && state.data.tasks) || [];
  const withCoords = tasks.filter((task) => Number.isFinite(task.lat) && Number.isFinite(task.lng));
  const zones = [];
  const cluster = densestCluster(getMapTasks());
  if (cluster) zones.push({ lat: cluster.lat, lng: cluster.lng, zoom: cluster.count >= 4 ? 13 : 14, ring: 2 });
  if (withCoords.length) {
    zones.push({
      lat: withCoords.reduce((sum, task) => sum + task.lat, 0) / withCoords.length,
      lng: withCoords.reduce((sum, task) => sum + task.lng, 0) / withCoords.length,
      zoom: 12,
      ring: 1,
    });
  }
  if (!zones.length) return;
  mapTilesWarmed = true;
  const subs = ['a', 'b', 'c'];
  zones.forEach((zone, index) => {
    const base = lngLatToTile(zone.lat, zone.lng, zone.zoom);
    for (let dx = -zone.ring; dx <= zone.ring; dx += 1) {
      for (let dy = -zone.ring; dy <= zone.ring; dy += 1) {
        const y = base.y + dy;
        if (y < 0) continue;
        const tile = new Image();
        tile.decoding = 'async';
        tile.src = `https://${subs[(index + dx + dy + 6) % 3]}.basemaps.cartocdn.com/light_all/${zone.zoom}/${base.x + dx}/${y}.png`;
      }
    }
  });
}

/**
 * 页面一打开就预热地图：先缓存地图 SDK，数据到位后再预热最密集地段的瓦片。
 * 目的是让管理员入场时的全屏大地图直接是已加载状态。
 */
function preloadMap() {
  if (mapProvider === 'amap' && amapKey) {
    if (!mapSdkPreloaded) {
      mapSdkPreloaded = true;
      preloadAmap(amapKey, amapSecurityCode);
    }
    if (!mapTilesWarmed && state.data) {
      const cluster = densestCluster(getMapTasks());
      mapTilesWarmed = true;
      warmAmapTiles({
        key: amapKey,
        securityCode: amapSecurityCode,
        lat: cluster ? cluster.lat : DEFAULT_REPORT_LOCATION.latitude,
        lng: cluster ? cluster.lng : DEFAULT_REPORT_LOCATION.longitude,
        zoom: cluster && cluster.count >= 4 ? 13 : 14,
      });
    }
    return;
  }
  preloadLeafletTiles();
}

function renderStatistics() {
  const total = state.data.tasks.length;
  return `<section class="statistics-view">
    <div class="stats-summary panel"><div><span class="eyebrow">本月业务摘要</span><h2>处置效率稳定提升</h2><p>共上报 126 项，116 项已完成分析，闭环率较上月提升 4.1%。</p></div><div class="stats-kpis"><div><strong>126</strong><span>上报总数</span></div><div><strong>92.6%</strong><span>处置闭环率</span></div><div><strong>18.4h</strong><span>平均处置时长</span></div><div><strong>${total - 1}</strong><span>有效识别类别</span></div></div></div>
    <div class="stats-grid">
      <div class="panel chart-panel large"><div class="panel-heading"><div><span class="eyebrow">业务趋势</span><h2>近 7 日上报与闭环</h2></div><button class="button button-secondary">${icon('calendar-days', 16)}近 7 日</button></div><div class="chart-wrap tall"><canvas id="stats-trend-chart"></canvas></div></div>
      <div class="panel category-panel"><div class="panel-heading"><div><span class="eyebrow">垃圾构成</span><h2>统一类别占比</h2></div></div><div class="donut-wrap"><canvas id="category-chart"></canvas><div class="donut-center"><strong>126</strong><span>总识别</span></div></div><div class="category-legend">${state.data.categoryStats.map((item) => `<span><i style="background:${item.color}"></i>${esc(item.name)}<strong>${item.value}%</strong></span>`).join('')}</div></div>
    </div>
    <div class="panel performance-table"><div class="panel-heading"><div><span class="eyebrow">河段绩效</span><h2>本月处置情况</h2></div><button class="button button-secondary">${icon('download', 16)}导出数据</button></div><table class="data-table"><thead><tr><th>河段</th><th>上报量</th><th>高风险</th><th>平均响应</th><th>闭环率</th><th>趋势</th></tr></thead><tbody>${state.data.riverSegments.slice(0,4).map((item, index) => `<tr><td><strong>${item.name}</strong><span>${item.area}</span></td><td><strong>${item.tasks}</strong></td><td>${[4,2,3,1][index]}</td><td>${[12.4,16.2,21.5,18.8][index]} 小时</td><td><strong>${[96,91,88,93][index]}%</strong></td><td><span class="trend-up">↗ ${[8,3,5,2][index]}%</span></td></tr>`).join('')}</tbody></table></div>
  </section>`;
}

function renderAdmin() {
  return `<section class="admin-view">
    <div class="admin-tabs"><button class="active">${icon('plug-zap', 17)}服务集成</button><button>${icon('waves', 17)}河段档案</button><button>${icon('scroll-text', 17)}审计日志</button></div>
    <div class="integration-banner"><span class="banner-icon">${icon('shield-check', 23)}</span><div><strong>服务密钥保持在后端</strong><p>此页面只显示连接状态和脱敏配置。识别 FastAPI 与 LLM API Key 由 Worker 从服务器环境读取，不会下发至浏览器。</p></div><span class="security-label">符合安全边界</span></div>
    <div class="integration-grid">
      ${state.data.integrations.map((item, index) => `<article class="integration-card">
        <div class="integration-icon">${icon(['server', 'scan-line', 'bot', 'cpu'][index], 21)}</div>
        <div class="integration-copy"><div><h2>${esc(item.name)}</h2>${badge(item.status)}</div><p>${esc(item.detail)}</p></div>
        <dl><div><dt>最近响应</dt><dd>${esc(item.latency)}</dd></div><div><dt>认证位置</dt><dd>${index === 0 ? 'HttpOnly Cookie' : index === 3 ? '本机进程' : '服务器环境变量'}</dd></div><div><dt>最近检查</dt><dd>刚刚</dd></div></dl>
        <div class="integration-actions"><button class="button button-secondary" data-action="test-integration" data-integration="${esc(item.name)}">${icon('activity', 16)}测试连接</button><button class="icon-button" title="集成详情" aria-label="集成详情">${icon('chevron-right', 17)}</button></div>
      </article>`).join('')}
    </div>
    <div class="admin-lower">
      <div class="panel config-panel"><div class="panel-heading"><div><span class="eyebrow">接入配置</span><h2>环境变量映射</h2></div><span class="config-scope">仅服务器</span></div><div class="code-table"><div><code>FASTAPI_BASE_URL</code><span>https://••••••••••••</span></div><div><code>FASTAPI_API_KEY</code><span>••••••••••••••••</span></div><div><code>LLM_BASE_URL</code><span>https://••••••/v1</span></div><div><code>LLM_API_KEY</code><span>••••••••••••••••</span></div><div><code>LLM_MODEL</code><span>gpt-5.5</span></div></div><p class="config-note">${icon('info', 15)} 修改服务端 <code>.env</code> 后重启 Web 与 Worker 生效。</p></div>
      <div class="panel service-log"><div class="panel-heading"><div><span class="eyebrow">运行状态</span><h2>近 24 小时</h2></div></div><div class="service-metrics"><div><strong>99.8%</strong><span>接口可用率</span></div><div><strong>2.1 s</strong><span>平均分析耗时</span></div><div><strong>0</strong><span>最终失败</span></div></div><div class="log-line"><span>16:31:04</span><b>INFO</b><p>task RW-20260902-0241 entered manual_review</p></div><div class="log-line"><span>16:29:18</span><b>INFO</b><p>worker lease renewed · queue_depth=2</p></div></div>
    </div>
  </section>`;
}

function renderLoading() {
  return `<div class="loading-screen"><span class="brand-mark">${icon('waves', 28)}</span><span class="loading-word">清川</span><strong>正在汇集河道态势</strong><div class="loading-line"></div></div>`;
}

function renderPortal() {
  const adminPoints = ['河道地图', '调度总览', '任务复核与派单', '数据统计', '系统集成'];
  const patrolPoints = ['现场拍照上报', 'AI 智能识别', '上报进度跟踪'];
  return `
    <div class="portal-page">
      <div class="portal-water" aria-hidden="true"></div>
      <div class="portal-hero">
        <span class="brand-mark">${icon('waves', 26)}</span>
        <p class="portal-kicker">Qingchuan · River Intelligence Console</p>
        <h1>河道垃圾智能处置平台</h1>
        <p class="portal-lead">以图像识别与业务大模型串联上报、研判、派单、清理与核验闭环，让每一次发现都抵达处置现场。</p>
      </div>
      <div class="portal-cards">
        <button class="portal-card" data-role-select="admin" type="button">
          <span class="portal-icon admin">${icon('shield-check', 25)}</span>
          <span class="portal-copy">
            <span class="portal-title"><strong>我是管理员</strong><em>调度统筹 · 不发起上报</em></span>
            <span class="portal-desc">进入即览河道地图，负责任务复核、派单调度与平台统计</span>
            <span class="portal-tags">${adminPoints.map((p) => `<i>${p}</i>`).join('')}</span>
          </span>
          <span class="portal-arrow">${icon('arrow-right', 20)}</span>
        </button>
        <button class="portal-card featured" data-role-select="patrol" type="button">
          <span class="portal-icon patrol">${icon('camera', 25)}</span>
          <span class="portal-copy">
            <span class="portal-title"><strong>我是巡河员</strong><em>一线执行 · 即拍即报</em></span>
            <span class="portal-desc">负责现场拍照上报，并跟踪本人上报任务的处置进度</span>
            <span class="portal-tags">${patrolPoints.map((p) => `<i>${p}</i>`).join('')}</span>
          </span>
          <span class="portal-arrow">${icon('arrow-right', 20)}</span>
        </button>
      </div>
      <p class="portal-foot">${isMobile ? '移动端已为您默认进入「巡河员」视图，可随时在右上角切换身份。' : '选择身份进入工作台，右上角可随时切换身份。'}</p>
    </div>`;
}
function renderMyTasks() {
  const me = state.data?.currentUser?.name || '当前用户';
  const mine = state.data.tasks.filter((task) =>
    String(task.reporter || '').includes('当前用户') || String(task.reporter || '') === me || task.reporter === me);
  if (!mine.length) {
    return `<section class="panel empty-state">
      <span class="empty-icon">${icon('clipboard-list', 26)}</span>
      <h2>还没有上报记录</h2>
      <p>上传一张现场照片，识别结果会出现在这里，并持续跟踪处置进度。</p>
      <button class="button button-primary" data-view="report">${icon('plus', 16)}去上报</button>
    </section>`;
  }
  return `<section class="panel my-task-list">
    <div class="task-toolbar"><div><span class="eyebrow">我的上报</span><h2 class="my-task-title">共 ${mine.length} 条记录</h2></div>
    <button class="button button-primary" data-view="report">${icon('plus', 16)}新建上报</button></div>
    <div class="my-task-rows">
      ${mine.map((task) => `
        <button class="my-task-row" data-task-id="${task.id}" type="button">
          ${task.image ? `<span class="my-task-thumb"><img src="${task.image}" alt="" loading="lazy"/></span>` : '<span class="my-task-thumb none"></span>'}
          <span class="my-task-main"><strong>${esc(task.segmentName || task.location || task.id)}</strong><small>${esc(task.id)} · ${esc(task.capturedAt || '刚刚上报')}</small>
            <span class="my-task-badges">${badge(task.risk)}${badge(task.status)}</span></span>
          <span class="my-task-meta"><span class="cat">${esc(task.category)}</span>${task.count ? `<small>${task.count} 个目标 · ${Math.round(task.confidence * 100)}%</small>` : '<small>识别处理中…</small>'}</span>
          ${icon('chevron-right', 17)}
        </button>`).join('')}
    </div>
  </section>`;
}

function renderView() {
  if (state.loading) return renderLoading();
  const views = { dashboard: renderDashboard, report: renderReport, tasks: renderTasks, map: renderMap, statistics: renderStatistics, admin: renderAdmin, myTasks: renderMyTasks };
  const allowed = (roleNav[state.role] || navItems).map((item) => item.id);
  const view = allowed.includes(state.view) ? state.view : viewForRole[state.role] || 'dashboard';
  return views[view]();
}

function render() {
  mapRenderToken += 1;
  chartInstances.splice(0).forEach((chart) => chart.destroy());
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }
  if (amapMapInstance) {
    destroyAmapMap(amapMapInstance);
    amapMapInstance = null;
  }
  if (state.loading) {
    app.innerHTML = renderLoading();
  } else if (!state.role) {
    app.innerHTML = renderPortal();
  } else {
    app.innerHTML = shell(renderView());
  }
  createIcons({ icons });
  bindEvents();
  queueMicrotask(initVisuals);
}

function bindEvents() {
  document.querySelectorAll('[data-role-select]').forEach((element) => element.addEventListener('click', () => {
    const role = /** @type {HTMLElement} */ (element).dataset.roleSelect;
    state.role = /** @type {'admin'|'patrol'} */ (role);
    state.view = viewForRole[state.role];
    state.mapIntro = state.role === 'admin'; // 管理员进入：先全屏大地图再缩小归位
    state.navOpen = false;
    history.replaceState(null, '', `#${state.view}`);
    render();
  }));

  document.querySelector('[data-role-switch]')?.addEventListener('change', (event) => {
    const role = /** @type {HTMLSelectElement} */ (event.target).value;
    state.role = /** @type {'admin'|'patrol'} */ (role);
    const allowed = roleNav[state.role].map((item) => item.id);
    if (!allowed.includes(state.view)) state.view = viewForRole[state.role];
    state.mapIntro = state.role === 'admin' && state.view === 'map';
    history.replaceState(null, '', `#${state.view}`);
    render();
  });

  document.querySelectorAll('[data-view]').forEach((element) => element.addEventListener('click', () => {
    const target = /** @type {HTMLElement} */ (element);
    state.view = target.dataset.view;
    state.navOpen = false;
    history.replaceState(null, '', `#${state.view}`);
    render();
  }));

  document.querySelector('[data-action="toggle-nav"]')?.addEventListener('click', () => { state.navOpen = !state.navOpen; render(); });
  document.querySelector('[data-action="close-nav"]')?.addEventListener('click', () => { state.navOpen = false; render(); });
  document.querySelector('[data-action="notifications"]')?.addEventListener('click', () => showToast('3 条新动态，已同步到实时事件列表。'));
  document.querySelector('[data-action="reset-filters"]')?.addEventListener('click', () => { state.filters = { keyword: '', risk: '', status: '', category: '' }; render(); });

  document.querySelectorAll('[data-task-id]').forEach((element) => element.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.currentTarget);
    const clickedTask = event.target instanceof Element ? event.target.closest('[data-task-id]') : null;
    if (clickedTask !== target) return;
    openMapTask(target.dataset.taskId);
  }));
  document.querySelectorAll('[data-filter]').forEach((element) => element.addEventListener(element.tagName === 'INPUT' ? 'input' : 'change', () => {
    const target = /** @type {HTMLInputElement|HTMLSelectElement} */ (element);
    state.filters[target.dataset.filter] = target.value;
    render();
  }));
  document.querySelectorAll('[data-map-filter]').forEach((element) => element.addEventListener('change', () => {
    const target = /** @type {HTMLSelectElement} */ (element);
    state.mapFilters[target.dataset.mapFilter] = target.value;
    render();
  }));

  const globalSearch = /** @type {HTMLInputElement|null} */ (document.querySelector('[data-global-search]'));
  globalSearch?.addEventListener('keydown', (event) => {
    if (/** @type {KeyboardEvent} */ (event).key === 'Enter' && globalSearch.value.trim()) {
      state.filters.keyword = globalSearch.value;
      state.view = state.role === 'admin' ? 'tasks' : 'myTasks';
      render();
    }
  });

  document.onkeydown = keyboardHandler;
  bindReportForm();
  document.querySelectorAll('[data-action="test-integration"]').forEach((button) => button.addEventListener('click', () => testIntegration(/** @type {HTMLButtonElement} */ (button))));
}

/** @param {KeyboardEvent} event */
function keyboardHandler(event) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    /** @type {HTMLInputElement|null} */ (document.querySelector('[data-global-search]'))?.focus();
  }
  if (event.key === 'Escape') closeOverlay();
}

/** 从照片 EXIF 读取拍摄时间并自动填入表单；无 EXIF 时回退到文件修改时间。 */
async function autofillCapturedTime(file, form) {
  const hiddenInput = /** @type {HTMLInputElement|null} */ (form.querySelector('[name="capturedAt"]'));
  const displayInput = /** @type {HTMLInputElement|null} */ (form.querySelector('.captured-display'));
  if (!hiddenInput || !displayInput) return;
  displayInput.value = '正在读取照片拍摄时间…';
  let exifDate = null;
  try {
    exifDate = await readExifCapturedAt(file);
  } catch (error) {
    exifDate = null;
  }
  if (exifDate) {
    hiddenInput.value = toDateTimeLocalValue(exifDate);
    displayInput.value = `${toDisplayValue(exifDate)} · 来自照片 EXIF`;
    return;
  }
  const fallback = new Date(file.lastModified || Date.now());
  hiddenInput.value = toDateTimeLocalValue(fallback);
  displayInput.value = file.type === 'image/jpeg'
    ? `${toDisplayValue(fallback)} · 照片无 EXIF，取文件修改时间`
    : `${toDisplayValue(fallback)} · 非 JPEG 无 EXIF，取文件修改时间`;
}

/** 所属河段自由输入 + 实时候选提示（交互类似填写收货地址）。 */
function bindSegmentSuggest() {
  const input = /** @type {HTMLInputElement|null} */ (document.querySelector('[name="riverSegment"]'));
  const box = /** @type {HTMLElement|null} */ (document.querySelector('.segment-suggest'));
  if (!input || !box) return;
  const hide = () => { box.classList.add('hidden'); box.innerHTML = ''; };
  const renderSuggest = () => {
    const query = input.value.trim().toLowerCase();
    const pool = state.data.riverSegments.filter((item) => item.status === '启用');
    const matches = (query
      ? pool.filter((item) => item.name.toLowerCase().includes(query)
        || item.area.toLowerCase().includes(query)
        || item.code.toLowerCase().includes(query))
      : pool).slice(0, 6);
    if (!matches.length) { hide(); return; }
    box.innerHTML = matches.map((item) => `<button type="button" class="suggest-item" role="option" data-segment-name="${esc(item.name)}"><strong>${esc(item.name)}</strong><small>${esc(item.area)} · ${esc(item.code)}</small></button>`).join('');
    box.classList.remove('hidden');
    box.querySelectorAll('[data-segment-name]').forEach((button) => button.addEventListener('mousedown', (event) => {
      event.preventDefault();
      input.value = /** @type {HTMLElement} */ (button).dataset.segmentName;
      hide();
    }));
  };
  input.addEventListener('input', renderSuggest);
  input.addEventListener('focus', renderSuggest);
  input.addEventListener('blur', () => setTimeout(hide, 120));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { hide(); return; }
    if (event.key === 'Enter' && !box.classList.contains('hidden')) {
      const first = /** @type {HTMLElement|null} */ (box.querySelector('[data-segment-name]'));
      if (first) {
        event.preventDefault();
        input.value = first.dataset.segmentName;
        hide();
      }
    }
  });
}

function bindReportForm() {
  const form = /** @type {HTMLFormElement|null} */ (document.querySelector('#report-form'));
  const input = /** @type {HTMLInputElement|null} */ (document.querySelector('#report-image'));
  const preview = /** @type {HTMLElement|null} */ (document.querySelector('#file-preview'));
  input?.addEventListener('change', () => {
    const files = [...(input.files || [])];
    if (!files.length) return;
    if (files.some((file) => file.size > 10 * 1024 * 1024)) {
      showToast('图片不能超过 10 MB。', 'error');
      input.value = '';
      return;
    }
    preview.classList.remove('hidden');
    const fileNames = files.map((file) => esc(file.name)).join('、');
    preview.innerHTML = `<img src="${URL.createObjectURL(files[0])}" alt="待上传照片预览"/><div><strong>${fileNames}</strong><span>${files.length} 张照片 · 每张均已通过大小预检</span></div><button type="button" class="icon-button" data-remove-file title="移除照片">${icon('x', 16)}</button>`;
    createIcons({ icons });
    preview.querySelector('[data-remove-file]').addEventListener('click', () => {
      input.value = '';
      preview.classList.add('hidden');
      const hiddenInput = /** @type {HTMLInputElement|null} */ (form?.querySelector('[name="capturedAt"]'));
      const displayInput = /** @type {HTMLInputElement|null} */ (form?.querySelector('.captured-display'));
      if (hiddenInput) hiddenInput.value = '';
      if (displayInput) displayInput.value = '选择照片后自动填入';
    });
    autofillCapturedTime(files[0], form);
  });
  bindSegmentSuggest();
  document.querySelector('[data-action="locate"]')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('当前浏览器不支持定位，请手动输入坐标或选择河段。', 'error');
      return;
    }
    showToast('正在获取当前位置…');
    navigator.geolocation.getCurrentPosition((position) => {
      const latInput = /** @type {HTMLInputElement|null} */ (document.querySelector('[name="latitude"]'));
      const lngInput = /** @type {HTMLInputElement|null} */ (document.querySelector('[name="longitude"]'));
      if (latInput) latInput.value = position.coords.latitude.toFixed(6);
      if (lngInput) lngInput.value = position.coords.longitude.toFixed(6);
      showToast('已获取当前位置。', 'success');
    }, () => showToast('定位失败或未授权，请手动选择河段或输入坐标。', 'error'), { enableHighAccuracy: true, timeout: 10000 });
  });
  document.querySelector('#report-form')?.addEventListener('submit', submitReport);
}

/** @param {SubmitEvent} event */
async function submitReport(event) {
  event.preventDefault();
  const form = /** @type {HTMLFormElement} */ (event.currentTarget);
  const submit = /** @type {HTMLButtonElement} */ (form.querySelector('[type="submit"]'));
  const images = [...(/** @type {HTMLInputElement} */ (form.querySelector('#report-image')).files || [])];
  if (!images.length) return showToast('请先选择一张现场照片。', 'error');
  const formData = new FormData(form);
  const segmentInput = String(formData.get('riverSegment') || '').trim();
  if (!segmentInput) return showToast('请填写所属河段。', 'error');
  const matchedSegment = state.data.riverSegments.find((item) => item.name === segmentInput)
    || state.data.riverSegments.find((item) => item.name.includes(segmentInput));
  const riverSegmentId = matchedSegment?.id || '';
  const riverSegmentName = matchedSegment?.name || segmentInput;
  if (!formData.get('capturedAt')) return showToast('未能读取拍摄时间，请重新选择照片。', 'error');
  const latitude = Number(formData.get('latitude')) || null;
  const longitude = Number(formData.get('longitude')) || null;
  const reason = String(formData.get('locationChangeReason') || '').trim();
  if ((latitude !== DEFAULT_REPORT_LOCATION.latitude || longitude !== DEFAULT_REPORT_LOCATION.longitude) && !reason) {
    return showToast('手动修改坐标时，请填写位置修改原因。', 'error');
  }
  submit.disabled = true;
  submit.innerHTML = `${icon('loader-circle', 17)}正在创建`;
  createIcons({ icons });
  try {
    const results = [];
    const modelFailures = [];
    for (const image of images) {
      const result = await api.createTask({ image, riverSegmentId, riverSegmentName, capturedAt: formData.get('capturedAt'), latitude, longitude, locationChangeReason: reason });
      if (llm && result?.objects) {
        try {
          Object.assign(result, await llm.analyzeRecognition(result), { modelStatus: 'completed' });
        } catch (error) {
          Object.assign(result, { modelStatus: 'failed', modelError: error.message || '大模型研判失败' });
          modelFailures.push(result.id);
        }
      }
      results.push(result);
    }
    const createdTasks = results.map((result, index) => taskRecordFromResult(result, {
      image: images[index],
      riverSegmentId,
      riverSegmentName,
      capturedAt: formData.get('capturedAt'),
      latitude,
      longitude,
    }));
    state.data.tasks.unshift(...createdTasks);
    showToast(`${results.length} 个识别任务已进入队列。`, 'success');
    if (modelFailures.length) showToast(`${modelFailures.length} 个任务已完成识别，但大模型研判暂时失败。`, 'error');
    setTimeout(() => { state.view = state.role === 'patrol' ? 'myTasks' : 'tasks'; render(); }, 700);
  } catch (error) {
    showToast(error.message || '创建任务失败。', 'error');
    submit.disabled = false;
  }
}

function taskRecordFromResult(result, payload) {
  const segment = state.data.riverSegments.find((item) => item.id === payload.riverSegmentId);
  const fallbackId = `TASK-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const task = {
    id: fallbackId,
    segmentId: payload.riverSegmentId,
    segmentName: segment?.name || payload.riverSegmentName || '待补充河段',
    location: '新建上报',
    category: '待识别',
    sourceCategory: 'unknown',
    confidence: 0,
    risk: '中',
    priority: '高',
    status: '待核查',
    stage: '人工复核',
    reporter: state.data.currentUser?.name || '当前用户',
    capturedAt: payload.capturedAt || new Date().toLocaleString('zh-CN', { hour12: false }),
    updatedAt: '刚刚',
    lat: payload.latitude,
    lng: payload.longitude,
    count: 0,
    coverage: '0%',
    duplicate: false,
    due: '待核查后确定',
    summary: '任务已创建，等待识别服务返回结果。',
    recommendation: '请结合现场情况完成业务复核。',
  };
  Object.assign(task, result || {}, {
    id: result?.id || fallbackId,
    segmentId: result?.segmentId ?? payload.riverSegmentId,
    segmentName: segment?.name || payload.riverSegmentName || result?.segmentName || '待补充河段',
    category: result?.modelCategory || result?.category || '待识别',
    risk: result?.modelRisk || result?.risk || '中',
    priority: result?.modelPriority || result?.priority || '高',
    summary: result?.modelSummary || result?.summary || '任务已创建，等待识别服务返回结果。',
    recommendation: result?.modelRecommendation || result?.recommendation || '请结合现场情况完成业务复核。',
    capturedAt: result?.capturedAt || payload.capturedAt,
    lat: result?.lat ?? payload.latitude,
    lng: result?.lng ?? payload.longitude,
    image: result?.image || (typeof URL?.createObjectURL === 'function' ? URL.createObjectURL(payload.image) : ''),
  });
  return task;
}

function openTask(taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task) return;
  selectedTaskId = taskId;
  const root = /** @type {HTMLElement} */ (document.querySelector('#overlay-root'));
  root.innerHTML = `<div class="overlay active"><button class="overlay-backdrop" data-close-overlay aria-label="关闭详情"></button><aside class="detail-drawer">
    <header><div><span class="eyebrow">任务详情</span><h2>${esc(task.id)}</h2></div><button class="icon-button" data-close-overlay aria-label="关闭详情">${icon('x', 19)}</button></header>
    <div class="detail-photo"><img src="${task.image}" alt="${esc(task.segmentName)}现场照片"/><div><span>${badge(task.risk)}</span><small>${esc(task.capturedAt)}</small></div></div>
    <div class="detail-body">
      <section class="detail-summary"><div><span class="eyebrow">智能研判</span><h3>${esc(task.category)}</h3></div><strong>${Math.round(task.confidence * 100)}<small>% 置信度</small></strong></section>
      <div class="detail-facts"><div><span>河段点位</span><strong>${esc(task.segmentName)}</strong><small>${esc(task.location)}</small></div><div><span>目标与覆盖</span><strong>${task.count} 个目标</strong><small>覆盖约 ${task.coverage}</small></div><div><span>处置状态</span><strong>${esc(task.status)}</strong><small>${esc(task.due)}</small></div><div><span>责任人员</span><strong>${esc(task.assignee || '尚未指派')}</strong><small>上报：${esc(task.reporter)}</small></div></div>
      ${(task.inferenceTimeMs != null || task.imageSize || task.objects?.length) ? `<section class="recognition-meta"><span class="eyebrow">FastAPI 原始识别</span><div><span>目标 ${task.count} 个</span>${task.inferenceTimeMs != null ? `<span>推理 ${task.inferenceTimeMs} ms</span>` : ''}${task.imageSize ? `<span>图像 ${task.imageSize.width} × ${task.imageSize.height}</span>` : ''}${task.samScore != null ? `<span>SAM ${task.samScore.toFixed(2)}</span>` : ''}</div></section>` : ''}
      ${task.duplicate ? `<div class="duplicate-alert">${icon('copy-check', 18)}<div><strong>疑似重复点位</strong><span>同河段 50 米内、24 小时内存在相同类别任务，仅作提示，不会自动合并。</span></div></div>` : ''}
      <section class="analysis-block"><h3>模型摘要${task.modelStatus === 'completed' ? ' · 大模型研判' : ''}</h3><p>${esc(task.summary)}</p>${task.modelError ? `<p class="model-error">${esc(task.modelError)}</p>` : ''}<h3>处置建议</h3><p>${esc(task.recommendation)}</p></section>
      <section class="process-track"><h3>流程进度</h3><div><span class="done"><i>${icon('check', 13)}</i><b>照片上报</b></span><span class="done"><i>${icon('check', 13)}</i><b>智能识别</b></span><span class="${task.status === '待核查' ? 'current' : 'done'}"><i>${task.status === '待核查' ? '3' : icon('check', 13)}</i><b>业务研判</b></span><span class="${['已派单','清理中','待核验','已清理'].includes(task.status) ? 'current' : ''}"><i>4</i><b>处置闭环</b></span></div></section>
    </div>
    <footer>${state.role === 'patrol'
      ? `<span class="drawer-hint">${['已完成', '已清理'].includes(task.status) ? '该上报已处置完成，感谢反馈。' : '上报已受理，处置进展会持续更新。'}</span><button class="button button-secondary" data-close-overlay>关闭</button>`
      : `<button class="button button-secondary" data-close-overlay>关闭</button><button class="button button-secondary" data-action="map-task">${icon('map', 17)}地图定位</button>${task.status === '待核查' ? `<button class="button button-primary" data-action="review-task">${icon('file-check-2', 17)}人工复核</button>` : task.status === '待派单' ? `<button class="button button-primary" data-action="assign-task">${icon('user-round-plus', 17)}立即派单</button>` : `<button class="button button-primary">${icon('external-link', 17)}查看处置单</button>`}`}</footer>
  </aside></div>`;
  createIcons({ icons });
  root.querySelectorAll('[data-close-overlay]').forEach((element) => element.addEventListener('click', closeOverlay));
  root.querySelector('[data-action="review-task"]')?.addEventListener('click', () => openReview(task));
  root.querySelector('[data-action="assign-task"]')?.addEventListener('click', () => openAssign(task));
  root.querySelector('[data-action="map-task"]')?.addEventListener('click', () => {
    closeOverlay();
    openMapTask(task.id);
  });
}

function openMapTask(taskId) {
  const task = state.data.tasks.find((item) => item.id === taskId);
  if (!task) return;
  state.mapFocusTaskId = taskId;
  state.mapFilters = { segment: '', risk: '', status: '' };
  state.view = 'map';
  state.navOpen = false;
  history.replaceState(null, '', '#map');
  render();
}

function openReview(task) {
  const root = /** @type {HTMLElement} */ (document.querySelector('#overlay-root'));
  root.querySelector('.detail-drawer').innerHTML = `<header><div><span class="eyebrow">人工复核</span><h2>${esc(task.id)}</h2></div><button class="icon-button" data-close-overlay>${icon('x', 19)}</button></header><form class="drawer-form" id="review-form"><div class="review-callout">${icon('triangle-alert', 19)}<div><strong>低置信度结果不可由模型补猜</strong><span>请依据现场信息确认最终业务结论，原始识别结果将完整保留。</span></div></div><label><span>复核结论</span><select name="decision"><option>确认有效</option><option>误报</option><option>需重新拍摄</option></select></label><div class="form-grid"><label><span>统一类别</span><select name="category"><option>${esc(task.category)}</option><option>塑料制品</option><option>生活垃圾</option><option>其他/无法判断</option></select></label><label><span>风险等级</span><select name="risk"><option>高</option><option>中</option><option>低</option></select></label><label><span>处置优先级</span><select name="priority"><option>紧急</option><option>高</option><option>普通</option></select></label></div><label><span>复核理由 *</span><textarea name="reason" rows="5" placeholder="说明确认依据或修正原因" required></textarea></label><footer><button class="button button-secondary" data-close-overlay type="button">取消</button><button class="button button-primary" type="submit">${icon('check', 17)}保存复核结论</button></footer></form>`;
  createIcons({ icons });
  root.querySelectorAll('[data-close-overlay]').forEach((element) => element.addEventListener('click', closeOverlay));
  root.querySelector('#review-form').addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(/** @type {HTMLFormElement} */ (event.currentTarget)); const payload = Object.fromEntries(data); const result = await api.reviewTask(task.id, payload); Object.assign(task, payload, { status: result.status || '待派单', stage: '分析完成' }); closeOverlay(); showToast('复核结论已保存，任务已进入待派单。', 'success'); });
}

function openAssign(task) {
  const root = /** @type {HTMLElement} */ (document.querySelector('#overlay-root'));
  root.querySelector('.detail-drawer').innerHTML = `<header><div><span class="eyebrow">任务派单</span><h2>${esc(task.segmentName)}</h2></div><button class="icon-button" data-close-overlay>${icon('x', 19)}</button></header><form class="drawer-form" id="assign-form"><div class="assignment-summary"><div>${badge(task.risk)}${badge(task.priority)}</div><strong>${esc(task.category)}</strong><span>${esc(task.location)}</span></div><label><span>清理负责人 *</span><select name="assigneeId" required><option value="">请选择已启用巡河员</option>${state.data.users.filter((user) => user.role === '巡河员' && user.status === '启用').map((user) => `<option value="${user.id}">${esc(user.name)} · 当前 ${user.workload} 单</option>`).join('')}</select></label><label><span>完成期限 *</span><input type="datetime-local" name="dueAt" value="2026-09-03T16:00" required /></label><label><span>任务说明</span><textarea name="note" rows="4" placeholder="补充现场安全要求或处置范围"></textarea></label><footer><button class="button button-secondary" data-close-overlay type="button">取消</button><button class="button button-primary" type="submit">${icon('send', 17)}确认派单</button></footer></form>`;
  createIcons({ icons });
  root.querySelectorAll('[data-close-overlay]').forEach((element) => element.addEventListener('click', closeOverlay));
  root.querySelector('#assign-form').addEventListener('submit', async (event) => { event.preventDefault(); const data = new FormData(/** @type {HTMLFormElement} */ (event.currentTarget)); const payload = Object.fromEntries(data); await api.assignOrder(task.id, payload); const assignee = state.data.users.find((user) => user.id === payload.assigneeId); Object.assign(task, { status: '已派单', stage: '等待处置', assignee: assignee?.name || '已指派' }); closeOverlay(); showToast('处置单已派发，负责人可在“我的处置单”中查看。', 'success'); });
}

function closeOverlay() {
  selectedTaskId = null;
  const root = document.querySelector('#overlay-root');
  if (root) root.innerHTML = '';
}

/** @param {HTMLButtonElement} button */
async function testIntegration(button) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `${icon('loader-circle', 16)}检查中`;
  createIcons({ icons });
  try {
    const result = await api.testIntegration();
    showToast(`${button.dataset.integration} 连接正常，响应 ${result.latency} ms。`, 'success');
  } catch (error) {
    showToast(error.message || '连接检查失败。', 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = original;
    createIcons({ icons });
  }
}

function showToast(message, type = 'info') {
  const region = document.querySelector('.toast-region') || document.body;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${icon(type === 'error' ? 'circle-alert' : type === 'success' ? 'circle-check' : 'info', 18)}<span>${esc(message)}</span>`;
  region.append(toast);
  createIcons({ icons });
  setTimeout(() => toast.classList.add('visible'), 10);
  setTimeout(() => { toast.classList.remove('visible'); setTimeout(() => toast.remove(), 220); }, 3200);
}

function initVisuals() {
  if (state.view === 'dashboard') initTrendChart('trend-chart', false);
  if (state.view === 'statistics') {
    initTrendChart('stats-trend-chart', true);
    initCategoryChart();
  }
  if (state.view === 'map') initMap();
}

function initTrendChart(id, filled) {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.querySelector(`#${id}`));
  if (!canvas) return;
  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: state.data.weeklyTrend.labels, datasets: [
      { label: '上报', data: state.data.weeklyTrend.reports, borderColor: '#0F6E56', backgroundColor: 'rgba(15,110,86,.12)', fill: filled, tension: .38, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#0F6E56', borderWidth: 2 },
      { label: '已闭环', data: state.data.weeklyTrend.disposed, borderColor: '#BA7517', backgroundColor: 'transparent', fill: false, tension: .38, pointRadius: 3, pointHoverRadius: 5, pointBackgroundColor: '#BA7517', borderWidth: 2 },
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0F6E56', padding: 12, cornerRadius: 10, boxPadding: 4, titleColor: '#ffffff', bodyColor: 'rgba(255,255,255,.88)', borderColor: 'rgba(255,255,255,.14)', borderWidth: 1, displayColors: true } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(20,60,50,.55)', font: { size: 11 } } }, y: { beginAtZero: true, grid: { color: 'rgba(15,110,86,.09)' }, border: { display: false }, ticks: { color: 'rgba(20,60,50,.55)', stepSize: 5, font: { size: 11 } } } } },
  });
  chartInstances.push(chart);
}

function initCategoryChart() {
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.querySelector('#category-chart'));
  if (!canvas) return;
  const chart = new Chart(canvas, { type: 'doughnut', data: { labels: state.data.categoryStats.map((item) => item.name), datasets: [{ data: state.data.categoryStats.map((item) => item.value), backgroundColor: state.data.categoryStats.map((item) => item.color), borderWidth: 0, hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false } } } });
  chartInstances.push(chart);
}

const MAP_INTRO_HOLD_MS = 780; // 全屏大地图停留时长
const MAP_INTRO_SHRINK_MS = 1250; // 缩小归位过渡时长

/**
 * 管理员入场动画：先全屏展示大地图（聚焦标点最密集地段），
 * 再慢慢变淡、缩小回正常布局。
 * readyPromise 用于等待地图首帧渲染完成——就绪前先藏起面板，避免放大一张空地图。
 */
function playMapIntro(enabled, readyPromise, afterShrink) {
  state.mapIntro = false; // 仅播放一次
  const finish = () => { if (afterShrink) afterShrink(); };
  if (!enabled) return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const frame = /** @type {HTMLElement|null} */ (document.querySelector('.map-frame'));
  const shellEl = /** @type {HTMLElement|null} */ (document.querySelector('.app-shell'));
  if (reduce || !frame || !shellEl) { window.setTimeout(finish, 240); return; }

  // 地图就绪前先藏起面板并压上暗角：宁可短暂留白，也不要放大一张未加载的地图
  frame.style.visibility = 'hidden';
  const veil = document.createElement('div');
  veil.className = 'map-intro-veil';
  shellEl.append(veil);
  document.body.classList.add('map-intro-active'); // 入场期间锁住滚动，避免放大后的地图撑出滚动条

  const cleanup = () => {
    frame.style.transition = '';
    frame.style.transform = '';
    frame.style.transformOrigin = '';
    frame.style.visibility = '';
    frame.classList.remove('map-frame-hero');
    veil.remove();
    document.body.classList.remove('map-intro-active');
  };

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    const rect = frame.getBoundingClientRect();
    if (!frame.isConnected || !rect.width || !rect.height) { cleanup(); finish(); return; }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.max(vw / rect.width, vh / rect.height) * 1.015;
    const offsetX = vw / 2 - (rect.left + rect.width / 2);
    const offsetY = vh / 2 - (rect.top + rect.height / 2);

    frame.style.transition = 'none';
    frame.style.transformOrigin = 'center center';
    frame.style.transform = `translate(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px) scale(${scale.toFixed(3)})`;
    frame.style.visibility = 'visible';
    frame.classList.add('map-frame-hero');

    window.setTimeout(() => {
      frame.style.transition = `transform ${MAP_INTRO_SHRINK_MS}ms cubic-bezier(.22,.61,.36,1)`;
      frame.style.transform = 'none';
      veil.classList.add('leaving');
      window.setTimeout(() => { cleanup(); finish(); }, MAP_INTRO_SHRINK_MS + 90);
    }, MAP_INTRO_HOLD_MS);
  };

  const guard = window.setTimeout(start, 2000); // 兜底：加载事件迟迟不来时也照常播放
  Promise.resolve(readyPromise).then(() => { window.clearTimeout(guard); start(); }).catch(() => { window.clearTimeout(guard); start(); });
}

async function initMap() {
  const container = document.querySelector('#river-map');
  if (!container) return;
  const renderToken = mapRenderToken;
  const intro = state.mapIntro; // 本次渲染是否播放全屏大地图入场
  const focus = state.mapFocusTaskId;
  const cluster = intro && !focus ? densestCluster(getMapTasks()) : null;
  const initialView = cluster ? { lat: cluster.lat, lng: cluster.lng, zoom: cluster.count >= 4 ? 13 : 14 } : null;
  if (mapProvider === 'amap' && amapKey) {
    try {
      const nextAmapMap = await createAmapMap({
        container,
        key: amapKey,
        securityCode: amapSecurityCode,
        tasks: getMapTasks(),
        focusTaskId: focus,
        onTaskClick: openTask,
        initialView,
      });
      if (renderToken !== mapRenderToken || !container.isConnected) {
        destroyAmapMap(nextAmapMap);
        return;
      }
      amapMapInstance = nextAmapMap;
      state.mapFocusTaskId = null;
      playMapIntro(intro, nextAmapMap.__ready, () => nextAmapMap.__fitAll?.());
      return;
    } catch (error) {
      if (renderToken !== mapRenderToken || !container.isConnected) return;
      showToast(`${error.message}，已切换为备用地图`, 'error');
    }
  }
  mapInstance = L.map(container, { zoomControl: false }).setView([DEFAULT_REPORT_LOCATION.latitude, DEFAULT_REPORT_LOCATION.longitude], 12);
  L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);
  const tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }).addTo(mapInstance);
  const leafletReady = new Promise((resolve) => {
    let settled = false;
    const settle = () => { if (!settled) { settled = true; resolve(); } };
    tileLayer.on('load', settle);
    window.setTimeout(settle, 1800);
  });
  mapInstance.on('popupopen', () => document.querySelector('[data-popup-task]')?.addEventListener('click', (event) => openTask(/** @type {HTMLElement} */ (event.currentTarget).dataset.popupTask)));
  const mapTasks = getMapTasks();
  const markers = [];
  mapTasks.forEach((task) => {
    const tone = task.risk === '高' ? '#f0655e' : task.risk === '中' ? '#f0a03c' : '#2dd4a7';
    const marker = L.circleMarker([task.lat, task.lng], { radius: task.risk === '高' ? 10 : 8, color: '#fff', weight: 3, fillColor: tone, fillOpacity: 1 });
    marker.bindPopup(`<div class="map-popup"><span>${esc(task.segmentName)}</span><strong>${esc(task.category)}</strong><small>${esc(task.status)} · ${esc(task.due)}</small><button data-popup-task="${task.id}">查看任务</button></div>`).addTo(mapInstance);
    markers.push(marker);
    if (task.id === focus) {
      mapInstance.setView([task.lat, task.lng], 16);
      marker.openPopup();
    }
  });
  const fitAll = () => {
    if (markers.length) mapInstance.fitBounds(L.latLngBounds(mapTasks.map((task) => [task.lat, task.lng])), { padding: [40, 40], maxZoom: 15 });
  };
  if (!focus && initialView) {
    mapInstance.setView([initialView.lat, initialView.lng], initialView.zoom || 13);
  } else if (!focus && markers.length) {
    fitAll();
  }
  state.mapFocusTaskId = null;
  setTimeout(() => mapInstance?.invalidateSize(), 100);
  playMapIntro(intro, leafletReady, fitAll);
}

async function bootstrap() {
  try {
    preloadMap(); // 页面一打开就先预热地图 SDK，缩短进入管理员时的等待
    state.data = await api.getBootstrap();
    state.loading = false;
    preloadMap(); // 数据到位：预热「标点最密集地段」的瓦片
    const urlRole = new URLSearchParams(location.search).get('role');
    state.role = urlRole === 'admin' || urlRole === 'patrol' ? urlRole : (isMobile ? 'patrol' : null); // ?role= 可直达；移动端默认巡河员；桌面进入身份门户
    const requestedView = location.hash.slice(1);
    const allowedIds = state.role ? roleNav[state.role].map((item) => item.id) : navItems.map((item) => item.id);
    if (allowedIds.includes(requestedView)) {
      state.view = requestedView;
    } else {
      state.view = viewForRole[state.role] || 'map'; // 管理员默认大地图，巡河员默认上报
    }
    render();
    maybeShowCover();
  } catch (error) {
    app.innerHTML = `<div class="fatal-state">${icon('cloud-off', 30)}<h1>平台服务暂时不可用</h1><p>${esc(error.message || '无法加载工作台数据')}</p><button class="button button-primary" onclick="location.reload()">重新连接</button></div>`;
    createIcons({ icons });
  }
}

/* ---------- 封面（已弃用：改为身份门户，入口见 renderPortal） ---------- */
const COVER_KEY = 'qingchuan.cover.v2';

function maybeShowCover() {
  try {
    if (sessionStorage.getItem(COVER_KEY)) return;
  } catch (error) { /* 隐私模式下 sessionStorage 不可用时仍展示封面 */ }
  showCover();
}

function showCover() {
  const cover = document.createElement('div');
  cover.id = 'cover-root';
  cover.innerHTML = `
    <img class="cover-layer cover-base" src="/assets/cover-base.jpg" alt="暮色中的城市河道航拍" />
    <div class="cover-reveal-wrap"><img class="cover-layer cover-reveal" src="/assets/cover-reveal.jpg" alt="清澈见底的河水" /></div>
    <div class="cover-vignette"></div>
    <nav class="cover-nav">
      <div class="cover-brand"><span class="brand-mark">${icon('waves', 22)}</span><span class="cover-word">清川</span></div>
      <span class="cover-nav-tag">River Intelligence Console</span>
    </nav>
    <div class="cover-heading">
      <h1><span class="cover-line1">一川清流</span><span class="cover-line2">皆被温柔守护</span></h1>
      <div class="cover-actions">
        <button class="cover-enter" data-cover-enter type="button">进入工作台 ${icon('arrow-right', 19)}</button>
      </div>
    </div>
    <div class="cover-bottom">
      <p>清川 · 河道垃圾智能处置平台。以图像识别与业务大模型串联上报、研判、派单、清理与核验，让每一次发现都抵达处置现场。</p>
      <p class="cover-note">15 段重点河道、24 小时智能研判、闭环可溯的处置节奏。</p>
    </div>`;
  document.body.append(cover);
  createIcons({ icons });
  const stopCover = initCover(cover);
  cover.querySelector('[data-cover-enter]')?.addEventListener('click', () => {
    try { sessionStorage.setItem(COVER_KEY, '1'); } catch (error) { /* 忽略存储异常 */ }
    cover.classList.add('leaving');
    setTimeout(() => { stopCover(); cover.remove(); }, 640);
  });
}

render();
bootstrap();
