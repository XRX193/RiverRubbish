let scriptPromise = null;

// Task coordinates are stored as WGS-84 (EXIF/API). AMap renders GCJ-02.
const MAP_CENTER_WGS84 = [30.3145, 120.1406];
const GCJ02_A = 6378245.0;
const GCJ02_EE = 0.00669342162296594323;
const PI = Math.PI;

function outOfChina(latitude, longitude) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function transformLatitude(x, y) {
  let value = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  value += (20 * Math.sin(y * PI) + 40 * Math.sin(y / 3 * PI)) * 2 / 3;
  value += (160 * Math.sin(y / 12 * PI) + 320 * Math.sin(y * PI / 30)) * 2 / 3;
  return value;
}

function transformLongitude(x, y) {
  let value = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  value += (20 * Math.sin(6 * x * PI) + 20 * Math.sin(2 * x * PI)) * 2 / 3;
  value += (20 * Math.sin(x * PI) + 40 * Math.sin(x / 3 * PI)) * 2 / 3;
  value += (150 * Math.sin(x / 12 * PI) + 300 * Math.sin(x / 30 * PI)) * 2 / 3;
  return value;
}

export function wgs84ToGcj02(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || outOfChina(lat, lng)) return [lat, lng];
  const dLat = transformLatitude(lng - 105, lat - 35);
  const dLng = transformLongitude(lng - 105, lat - 35);
  const radLat = lat / 180 * PI;
  let magic = Math.sin(radLat);
  magic = 1 - GCJ02_EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  const latOffset = dLat * 180 / ((GCJ02_A * (1 - GCJ02_EE)) / (magic * sqrtMagic) * PI);
  const lngOffset = dLng * 180 / (GCJ02_A / sqrtMagic * Math.cos(radLat) * PI);
  return [lat + latOffset, lng + lngOffset];
}

function amapPosition(task) {
  const [lat, lng] = task.coordinateSystem === 'gcj02'
    ? [Number(task.lat), Number(task.lng)]
    : wgs84ToGcj02(task.lat, task.lng);
  return [lng, lat];
}

function loadScript(key, securityCode = '') {
  const globals = /** @type {any} */ (globalThis);
  if (globals.AMap) return Promise.resolve(globals.AMap);
  if (scriptPromise) return scriptPromise;
  if (!key) return Promise.reject(new Error('未配置高德地图 Key'));

  scriptPromise = new Promise((resolve, reject) => {
    const callbackName = `__riverAmapReady_${Date.now()}`;
    const script = document.createElement('script');
    const cleanup = () => {
      delete window[callbackName];
      script.remove();
    };

    if (securityCode) {
      globals._AMapSecurityConfig = { securityJsCode: securityCode };
    }
    window[callbackName] = () => {
      cleanup();
      if (globals.AMap) resolve(globals.AMap);
      else reject(new Error('高德地图脚本已加载，但 AMap 不可用'));
    };
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.ToolBar&callback=${callbackName}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error('高德地图脚本加载失败，请检查 Key、安全密钥、域名白名单或网络连接'));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });
  return scriptPromise;
}

/** 预热高德 SDK：页面一打开就调用，等用户选择身份时脚本已就绪。 */
export function preloadAmap(key, securityCode = '') {
  if (!key) return Promise.resolve(null);
  return loadScript(key, securityCode).catch(() => null);
}

/**
 * 预热目标区域的瓦片：用一张不可见的临时地图把瓦片拉进浏览器缓存，稍后销毁。
 * 这样真正的地图创建时，初始视野可以立刻渲染出来。
 */
export async function warmAmapTiles({ key, securityCode = '', lat, lng, zoom = 13, holdMs = 3200 }) {
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  let AMap;
  try {
    AMap = await loadScript(key, securityCode);
  } catch (error) {
    return;
  }
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-100000px;top:0;width:1280px;height:860px;pointer-events:none;opacity:0;';
  document.body.append(holder);
  const [gcjLat, gcjLng] = wgs84ToGcj02(lat, lng);
  let warm = null;
  try {
    warm = new AMap.Map(holder, {
      zoom,
      center: [gcjLng, gcjLat],
      mapStyle: 'amap://styles/dark',
      resizeEnable: false,
      zoomEnable: false,
      dragEnable: false,
    });
  } catch (error) {
    holder.remove();
    return;
  }
  window.setTimeout(() => {
    try { warm?.clearMap?.(); warm?.destroy?.(); } catch (error) { /* 忽略销毁异常 */ }
    holder.remove();
  }, holdMs);
}

export async function createAmapMap({ container, key, securityCode = '', tasks, focusTaskId, onTaskClick, initialView = null }) {
  const AMap = await loadScript(key, securityCode);
  const [centerLatitude, centerLongitude] = wgs84ToGcj02(...MAP_CENTER_WGS84);
  const map = new AMap.Map(container, {
    zoom: 12,
    center: [centerLongitude, centerLatitude],
    mapStyle: 'amap://styles/dark',
    resizeEnable: true,
    zoomEnable: true,
  });

  if (AMap.ToolBar) {
    map.addControl(new AMap.ToolBar({ position: 'RB' }));
  }

  const points = tasks.filter((task) => task.lat != null && task.lng != null);
  const markers = [];
  points.forEach((task) => {
    const position = amapPosition(task);
    const marker = new AMap.Marker({ position, title: task.segmentName, anchor: 'bottom-center' });
    const info = `<div class="map-popup"><span>${escapeHtml(task.segmentName)}</span><strong>${escapeHtml(task.category)}</strong><small>${escapeHtml(task.status)} · ${escapeHtml(task.due)}</small><button data-popup-task="${escapeHtml(task.id)}">查看任务</button></div>`;
    const openInfo = () => {
      const infoWindow = new AMap.InfoWindow({ content: info, offset: new AMap.Pixel(0, -28), isCustom: false });
      infoWindow.open(map, position);
      window.setTimeout(() => {
        document.querySelector('[data-popup-task]')?.addEventListener('click', (event) => {
          const target = /** @type {HTMLElement} */ (event.currentTarget);
          onTaskClick(target.dataset.popupTask);
        });
      }, 0);
    };
    marker.on('click', openInfo);
    marker.setMap(map);
    markers.push(marker);
    if (task.id === focusTaskId) {
      map.setZoomAndCenter(16, position);
      window.setTimeout(openInfo, 50);
    }
  });
  // 视野优先级：聚焦单个任务 > 指定的初始视野（如全屏入场的密集地段）> 适配全部标点
  if (!focusTaskId && initialView && Number.isFinite(initialView.lat) && Number.isFinite(initialView.lng)) {
    const [lat, lng] = wgs84ToGcj02(initialView.lat, initialView.lng);
    map.setZoomAndCenter(initialView.zoom || 13, [lng, lat]);
  } else if (!focusTaskId && markers.length) {
    map.setFitView(markers, false, [60, 60, 60, 60], 15);
  }
  // 供调用方在入场动画结束后再切回「适配全部标点」
  map.__fitAll = () => {
    if (markers.length) map.setFitView(markers, false, [60, 60, 60, 60], 15);
  };
  // 底图瓦片加载完成（首帧可见）后 resolve，供全屏入场动画等待，避免放大一张空地图
  map.__ready = new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    try { map.on('complete', done); } catch (error) { /* 事件不可用时走兜底定时 */ }
    window.setTimeout(done, 1800);
  });
  return map;
}

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function destroyAmapMap(map) {
  map?.clearMap?.();
  map?.destroy?.();
}
