let scriptPromise = null;

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

export async function createAmapMap({ container, key, securityCode = '', tasks, focusTaskId, onTaskClick }) {
  const AMap = await loadScript(key, securityCode);
  const map = new AMap.Map(container, {
    zoom: 12,
    center: [120.169, 30.272],
    mapStyle: 'amap://styles/dark',
    resizeEnable: true,
    zoomEnable: true,
  });

  if (AMap.ToolBar) {
    map.addControl(new AMap.ToolBar({ position: 'RB' }));
  }

  const points = tasks.filter((task) => task.lat != null && task.lng != null);
  points.forEach((task) => {
    const position = [Number(task.lng), Number(task.lat)];
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
    if (task.id === focusTaskId) {
      map.setZoomAndCenter(16, position);
      window.setTimeout(openInfo, 50);
    }
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
