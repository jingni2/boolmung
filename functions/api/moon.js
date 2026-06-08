const MOON_API_BASE = "https://d5.co.kr/wp-json/d5-moon/v1";

const json = (data, status = 200, headers = {}) => Response.json(data, {
  status,
  headers: {
    "cache-control": "public, max-age=300, s-maxage=300",
    "content-type": "application/json; charset=utf-8",
    ...headers,
  },
});

const getSeoulDateString = (date = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(date);

const normalizePhaseName = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
};

const buildMoonImageUrl = (lunarDay) => {
  const safeDay = Math.max(1, Math.min(30, Math.trunc(lunarDay)));
  const imageDay = safeDay === 30 ? 15 : safeDay;
  return {
    imageDay,
    imageUrl: `https://d5.co.kr/img/luna/1/${String(imageDay).padStart(2, "0")}.png`,
  };
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "boolmung-moon-proxy/1.0",
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(`Moon API returned ${response.status} for ${url}`);
  }

  return response.json();
};

const isValidMoonResponse = (datePayload, phasePayload, expectedDate) => {
  if (datePayload?.status !== "success" || phasePayload?.status !== "success") {
    return false;
  }

  if (datePayload?.date?.solar !== expectedDate || phasePayload?.date !== expectedDate) {
    return false;
  }

  const lunarDay = Number(datePayload?.date?.lunar?.day);
  const illumination = Number(datePayload?.moon?.illumination);
  const phaseIllumination = Number(phasePayload?.phase?.illumination);

  if (!Number.isFinite(lunarDay) || lunarDay < 1 || lunarDay > 30) {
    return false;
  }

  if (!Number.isFinite(illumination) || illumination < 0 || illumination > 100) {
    return false;
  }

  if (!Number.isFinite(phaseIllumination) || phaseIllumination < 0 || phaseIllumination > 100) {
    return false;
  }

  if (Math.abs(illumination - phaseIllumination) > 5) {
    return false;
  }

  const datePhaseName = normalizePhaseName(datePayload?.moon?.phase);
  const phaseName = normalizePhaseName(phasePayload?.phase?.name);
  if (!datePhaseName || !phaseName) {
    return false;
  }

  return datePhaseName === phaseName;
};

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const requestedDate = url.searchParams.get("date");
  const seoulDate = requestedDate || getSeoulDateString();

  try {
    const [datePayload, phasePayload] = await Promise.all([
      fetchJson(`${MOON_API_BASE}/date/${seoulDate}`),
      fetchJson(`${MOON_API_BASE}/phase/${seoulDate}`),
    ]);

    if (!isValidMoonResponse(datePayload, phasePayload, seoulDate)) {
      return json({
        status: "error",
        error: "Moon API validation failed",
        verified: false,
        requestedDate: seoulDate,
      }, 502, {
        "cache-control": "no-store",
      });
    }

    const lunarDay = Number(datePayload.date.lunar.day);
    const illumination = Number(datePayload.moon.illumination);
    const { imageDay, imageUrl } = buildMoonImageUrl(lunarDay);

    return json({
      status: "success",
      verified: true,
      requestedDate: seoulDate,
      source: "d5-moon/v1",
      date: {
        solar: datePayload.date.solar,
        lunar: {
          year: Number(datePayload.date.lunar.year),
          month: Number(datePayload.date.lunar.month),
          day: lunarDay,
          leap: Boolean(datePayload.date.lunar.leap),
        },
      },
      moon: {
        phase: normalizePhaseName(datePayload.moon.phase),
        phaseEn: phasePayload.phase?.name_en || datePayload.moon.phase_en || "",
        icon: phasePayload.phase?.icon || datePayload.moon.icon || "",
        illumination,
        age: Number(phasePayload.phase?.age ?? datePayload.moon.age ?? 0),
        imageDay,
        imageUrl,
      },
      time: {
        moonrise: datePayload.time?.moonrise || "",
        moonset: datePayload.time?.moonset || "",
      },
    });
  } catch (error) {
    return json({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown moon API error",
      verified: false,
      requestedDate: seoulDate,
    }, 502, {
      "cache-control": "no-store",
    });
  }
};
