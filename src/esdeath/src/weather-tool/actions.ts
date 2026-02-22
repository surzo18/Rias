import type { Tier } from '../shared/types.js';

export type WeatherAction = 'current' | 'forecast';

interface ActionDef {
  tier: Tier;
  requiredParams: string[];
}

export const ACTIONS: Record<WeatherAction, ActionDef> = {
  current:  { tier: 'safe', requiredParams: ['location'] },
  forecast: { tier: 'safe', requiredParams: ['location'] },
};

const WTTR_BASE = 'https://wttr.in';

export function getActionTier(action: string): Tier {
  const def = ACTIONS[action as WeatherAction];
  return def ? def.tier : 'forbidden';
}

export function buildApiUrl(action: string, params: Record<string, unknown>): string {
  const def = ACTIONS[action as WeatherAction];
  if (!def) throw new Error(`Unknown action: ${action}`);

  for (const req of def.requiredParams) {
    if (params[req] === undefined || params[req] === null || params[req] === '') {
      throw new Error(`Missing required parameter: ${req}`);
    }
  }

  const location = encodeURIComponent(String(params.location));
  return `${WTTR_BASE}/${location}?format=j1`;
}

export interface CurrentWeather {
  location: string;
  temp_C: number;
  feels_like_C: number;
  humidity: number;
  weather_desc: string;
  wind_kmph: number;
  precip_mm: number;
  visibility_km: number;
  pressure_mb: number;
  uv_index: number;
  observation_time: string;
}

export interface ForecastDay {
  date: string;
  maxtemp_C: number;
  mintemp_C: number;
  avgtemp_C: number;
  weather_desc: string;
  chance_of_rain: number;
  chance_of_snow: number;
  total_snow_cm: number;
  sunrise: string;
  sunset: string;
}

export function extractCurrentWeather(
  data: Record<string, unknown>,
  location: string,
): CurrentWeather {
  const current = (data.current_condition as Record<string, unknown>[])?.[0];
  if (!current) throw new Error('No current weather data available');

  const desc = (current.weatherDesc as Record<string, string>[])?.[0]?.value ?? 'Unknown';

  return {
    location,
    temp_C: Number(current.temp_C),
    feels_like_C: Number(current.FeelsLikeC),
    humidity: Number(current.humidity),
    weather_desc: desc,
    wind_kmph: Number(current.windspeedKmph),
    precip_mm: Number(current.precipMM),
    visibility_km: Number(current.visibility),
    pressure_mb: Number(current.pressure),
    uv_index: Number(current.uvIndex),
    observation_time: String(current.observation_time ?? ''),
  };
}

export function extractForecast(
  data: Record<string, unknown>,
  location: string,
): { location: string; forecast: ForecastDay[] } {
  const weather = data.weather as Record<string, unknown>[];
  if (!weather || weather.length === 0) throw new Error('No forecast data available');

  const forecast: ForecastDay[] = weather.map((day) => {
    const hourly = day.hourly as Record<string, unknown>[];
    const midday = hourly?.[4];
    const desc = midday
      ? ((midday.weatherDesc as Record<string, string>[])?.[0]?.value ?? 'Unknown')
      : 'Unknown';
    const astronomy = (day.astronomy as Record<string, string>[])?.[0];

    return {
      date: String(day.date),
      maxtemp_C: Number(day.maxtempC),
      mintemp_C: Number(day.mintempC),
      avgtemp_C: Number(day.avgtempC),
      weather_desc: desc,
      chance_of_rain: Number(midday?.chanceofrain ?? 0),
      chance_of_snow: Number(midday?.chanceofsnow ?? 0),
      total_snow_cm: Number(day.totalSnow_cm ?? 0),
      sunrise: astronomy?.sunrise ?? '',
      sunset: astronomy?.sunset ?? '',
    };
  });

  return { location, forecast };
}
