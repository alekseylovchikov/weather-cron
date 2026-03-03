const LOCATION_NAME = process.env.LOCATION_NAME || "Лимассол";
const LATITUDE = Number.parseFloat(process.env.LATITUDE || "34.6841");
const LONGITUDE = Number.parseFloat(process.env.LONGITUDE || "33.0379");
const TIMEZONE = process.env.TIMEZONE || "auto";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WORLD_NEWS_API_KEY = process.env.WORLD_NEWS_API_KEY;

const NF_1 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

const PM25_BREAKPOINTS = [
  { max: 10, label: "Хорошо" },
  { max: 20, label: "Удовлетворительно" },
  { max: 25, label: "Умеренно" },
  { max: 50, label: "Плохо" },
  { max: 75, label: "Очень плохо" },
  { max: Infinity, label: "Крайне плохо" },
];

const PM10_BREAKPOINTS = [
  { max: 20, label: "Хорошо" },
  { max: 40, label: "Удовлетворительно" },
  { max: 50, label: "Умеренно" },
  { max: 100, label: "Плохо" },
  { max: 150, label: "Очень плохо" },
  { max: Infinity, label: "Крайне плохо" },
];

function formatNumber(value) {
  if (!Number.isFinite(value)) return null;
  return NF_1.format(value);
}

function formatDate(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}.${month}.${year}`;
}

function average(values) {
  if (!Array.isArray(values)) return null;
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  const sum = nums.reduce((acc, v) => acc + v, 0);
  return sum / nums.length;
}

function maximum(values) {
  if (!Array.isArray(values)) return null;
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return Math.max(...nums);
}

function classifyEaqi(value, breakpoints) {
  if (!Number.isFinite(value)) return null;
  const index = breakpoints.findIndex((item) => value <= item.max);
  if (index === -1) return null;
  return { label: breakpoints[index].label, index: index + 1 };
}

function isDangerousLevel(level) {
  return level ? level.index >= 4 : false;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed: ${res.status} ${res.statusText} - ${body}`);
  }
  return res.json();
}

async function getWeather(dayOffset = 0) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", LATITUDE.toString());
  url.searchParams.set("longitude", LONGITUDE.toString());
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "wind_speed_10m_max",
    ].join(",")
  );
  url.searchParams.set("forecast_days", String(dayOffset + 1));
  url.searchParams.set("timezone", TIMEZONE);
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("precipitation_unit", "mm");

  const data = await fetchJson(url.toString());
  const daily = data?.daily || {};

  return {
    date: daily.time?.[dayOffset],
    tempMax: daily.temperature_2m_max?.[dayOffset],
    tempMin: daily.temperature_2m_min?.[dayOffset],
    precip: daily.precipitation_sum?.[dayOffset],
    windMax: daily.wind_speed_10m_max?.[dayOffset],
  };
}

async function getAirQuality(dayOffset = 0) {
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.searchParams.set("latitude", LATITUDE.toString());
  url.searchParams.set("longitude", LONGITUDE.toString());
  url.searchParams.set("hourly", "pm10,pm2_5");
  url.searchParams.set("forecast_days", String(dayOffset + 1));
  url.searchParams.set("timezone", TIMEZONE);

  const data = await fetchJson(url.toString());
  const hourly = data?.hourly || {};

  const startIdx = dayOffset * 24;
  const endIdx = startIdx + 24;

  const pm10Slice = (hourly.pm10 || []).slice(startIdx, endIdx);
  const pm25Slice = (hourly.pm2_5 || []).slice(startIdx, endIdx);

  const pm10Avg = average(pm10Slice);
  const pm10Max = maximum(pm10Slice);
  const pm25Avg = average(pm25Slice);
  const pm25Max = maximum(pm25Slice);

  return { pm10Avg, pm10Max, pm25Avg, pm25Max };
}

async function getCyprusNews(limit = 3) {
  if (!WORLD_NEWS_API_KEY) {
    return null;
  }

  const url = new URL("https://api.worldnewsapi.com/top-news");
  url.searchParams.set("source-country", "cy");
  url.searchParams.set("language", "en");
  url.searchParams.set("api-key", WORLD_NEWS_API_KEY);

  try {
    const data = await fetchJson(url.toString());
    const clusters = Array.isArray(data?.top_news) ? data.top_news : [];
    const allNews = clusters.flatMap((cluster) =>
      Array.isArray(cluster?.news) ? cluster.news : []
    );

    const unique = [];
    const seenTitles = new Set();
    for (const item of allNews) {
      const title = typeof item?.title === "string" ? item.title.trim() : "";
      if (!title || seenTitles.has(title)) continue;
      seenTitles.add(title);
      unique.push({
        title,
        url: typeof item?.url === "string" ? item.url : null,
      });
      if (unique.length >= limit) break;
    }

    if (!unique.length) {
      return null;
    }

    return unique;
  } catch (error) {
    console.error(
      "Failed to fetch Cyprus news:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram error: ${res.status} ${res.statusText} - ${body}`);
  }
}

function buildMessage({ weather, air, news, isTomorrow }) {
  const dateFormatted = formatDate(weather.date);
  const dayWord = isTomorrow ? "завтра" : "сегодня";
  const dateLabel = dateFormatted ? `${dayWord}, ${dateFormatted}` : dayWord;
  const lines = [`📍 ${LOCATION_NAME} — погода на ${dateLabel} (прогноз)`];

  const tempMin = formatNumber(weather.tempMin);
  const tempMax = formatNumber(weather.tempMax);
  if (tempMin && tempMax) {
    lines.push(`🌡️ Температура: ${tempMin}…${tempMax} °C`);
  }

  const precip = formatNumber(weather.precip);
  if (precip) {
    lines.push(`🌧️ Осадки: ${precip} мм`);
  }

  const windMax = formatNumber(weather.windMax);
  if (windMax) {
    lines.push(`💨 Ветер: до ${windMax} м/с`);
  }

  if (air) {
    const pm10Level = classifyEaqi(air.pm10Avg, PM10_BREAKPOINTS);
    const pm25Level = classifyEaqi(air.pm25Avg, PM25_BREAKPOINTS);

    const pm10Avg = formatNumber(air.pm10Avg);
    const pm10Max = formatNumber(air.pm10Max);
    if (pm10Avg && pm10Max) {
      const suffix = pm10Level ? ` — ${pm10Level.label}` : "";
      lines.push(
        `🌫️ Пыль (PM10): ср. ${pm10Avg} мкг/м³, макс. ${pm10Max} мкг/м³${suffix}`
      );
    }

    const pm25Avg = formatNumber(air.pm25Avg);
    const pm25Max = formatNumber(air.pm25Max);
    if (pm25Avg && pm25Max) {
      const suffix = pm25Level ? ` — ${pm25Level.label}` : "";
      lines.push(
        `🌫️ Пыль (PM2.5): ср. ${pm25Avg} мкг/м³, макс. ${pm25Max} мкг/м³${suffix}`
      );
    }

    const levels = [pm10Level, pm25Level].filter(Boolean);
    if (levels.length) {
      const worst = levels.reduce((a, b) => (a.index >= b.index ? a : b));
      const danger = isDangerousLevel(worst) ? "опасно" : "не опасно";
      const marker = isDangerousLevel(worst) ? "⚠️" : "✅";
      lines.push(`${marker} Оценка пыли: ${danger} (${worst.label})`);
    }
  }

  if (Array.isArray(news) && news.length > 0) {
    lines.push("");
    lines.push("📰 Краткая новостная сводка по Кипру:");
    news.forEach((item, index) => {
      const title = item?.title;
      const url = item?.url;
      if (title && url) {
        lines.push(`${index + 1}. ${title} — ${url}`);
      } else if (title) {
        lines.push(`${index + 1}. ${title}`);
      }
    });
  }

  return lines.join("\n");
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  if (!Number.isFinite(LATITUDE) || !Number.isFinite(LONGITUDE)) {
    res.status(500).json({ error: "Invalid LATITUDE/LONGITUDE" });
    return;
  }

  const dryRun = req.query?.dry === "1" || req.query?.dry === "true";
  const dayParam = req.query?.day || "today";
  const dayOffset = dayParam === "tomorrow" ? 1 : 0;

  if (!dryRun && (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID)) {
    res.status(500).json({
      error: "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID",
    });
    return;
  }

  try {
    const [weather, air, news] = await Promise.all([
      getWeather(dayOffset),
      getAirQuality(dayOffset),
      getCyprusNews(),
    ]);
    const message = buildMessage({
      weather,
      air,
      news,
      isTomorrow: dayOffset === 1,
    });

    if (!dryRun) {
      await sendTelegramMessage(message);
    }

    res.status(200).json({ ok: true, message, dryRun });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
