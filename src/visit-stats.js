const statsElement = document.getElementById("visitStats");
const visitorCountElement = document.getElementById("visitorCount");
const stayTimeElement = document.getElementById("stayTime");

const hostname = window.location.hostname;
const isBoolmungDeployment = hostname === "boolmung.pages.dev"
  || hostname.endsWith(".boolmung.pages.dev");

const formatStayTime = (seconds) => {
  const totalMinutes = Math.floor(Math.max(0, seconds) / 60);
  if (totalMinutes < 1) {
    return "1분 미만";
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}분`;
  }
  if (minutes === 0) {
    return `${hours}시간`;
  }
  return `${hours}시간 ${minutes}분`;
};

const createId = () => {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const getStoredId = (storage, key) => {
  try {
    const savedId = storage.getItem(key);
    if (savedId) {
      return savedId;
    }
    const newId = createId();
    storage.setItem(key, newId);
    return newId;
  } catch {
    return createId();
  }
};

const showStats = ({ visitors = 0, totalSeconds = 0 }) => {
  visitorCountElement.textContent = `${visitors.toLocaleString("ko-KR")}명`;
  stayTimeElement.textContent = formatStayTime(totalSeconds);
  statsElement.dataset.state = "ready";
};

const showUnavailable = () => {
  visitorCountElement.textContent = "집계 대기";
  stayTimeElement.textContent = "집계 대기";
  statsElement.dataset.state = "unavailable";
};

if (!isBoolmungDeployment) {
  visitorCountElement.textContent = "로컬 미집계";
  stayTimeElement.textContent = "로컬 미집계";
  statsElement.dataset.state = "local";
} else {
  const visitorId = getStoredId(window.localStorage, "boolmung-visitor-id");
  const sessionId = getStoredId(window.sessionStorage, "boolmung-session-id");
  const sessionStartedAt = Date.now();
  let visibleSeconds = 0;
  let visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  let lastReportedSeconds = -1;
  let requestInFlight = false;

  const updateVisibleSeconds = () => {
    if (visibleSince === null) {
      return;
    }
    const now = Date.now();
    visibleSeconds += Math.max(0, (now - visibleSince) / 1000);
    visibleSince = now;
  };

  const requestStats = async (method = "GET", keepalive = false) => {
    if (requestInFlight && method === "POST") {
      return;
    }

    if (method === "POST") {
      updateVisibleSeconds();
      const roundedSeconds = Math.floor(visibleSeconds);
      if (roundedSeconds === lastReportedSeconds) {
        return;
      }
      lastReportedSeconds = roundedSeconds;
      requestInFlight = true;

      try {
        const response = await fetch("/api/stats", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            visitorId,
            sessionId,
            activeSeconds: roundedSeconds,
            sessionStartedAt,
          }),
          keepalive,
        });
        if (!response.ok) {
          throw new Error(`Stats API returned ${response.status}`);
        }
        showStats(await response.json());
      } catch {
        showUnavailable();
      } finally {
        requestInFlight = false;
      }
      return;
    }

    try {
      const response = await fetch("/api/stats", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Stats API returned ${response.status}`);
      }
      showStats(await response.json());
    } catch {
      showUnavailable();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      visibleSince = Date.now();
      return;
    }
    updateVisibleSeconds();
    visibleSince = null;
    requestStats("POST", true);
  });

  window.addEventListener("pagehide", () => {
    requestStats("POST", true);
  });

  requestStats("POST");
  window.setInterval(() => requestStats("POST"), 15000);
  window.setInterval(() => requestStats("GET"), 30000);
}
