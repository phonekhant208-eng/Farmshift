import { NextResponse } from 'next/server';
import { buildEnvironmentData } from '@/services/engine/environmentBuilder';
import { evaluateCrops } from '@/services/engine/cropEngine';

// Myanmar bounding box (approx.) – the app only serves Myanmar.
const MM = { latMin: 9.5, latMax: 28.6, lonMin: 92.1, lonMax: 101.2 };

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const isYmd = (s: string) => /^\d{8}$/.test(s);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const lat = parseFloat(searchParams.get('lat') ?? '16.8661');
    const lon = parseFloat(searchParams.get('lon') ?? '96.1951');

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return NextResponse.json({ success: false, error: 'lat and lon must be numbers' }, { status: 400 });
    }
    if (lat < MM.latMin || lat > MM.latMax || lon < MM.lonMin || lon > MM.lonMax) {
      return NextResponse.json(
        { success: false, error: 'Location is outside Myanmar. Only Myanmar is supported.' },
        { status: 400 }
      );
    }

    // Default = full rice -> black gram season (1 May - 10 Dec).
    // Before May there is no data yet for this year's season, so use last year's.
    // NASA POWER lags a few days and rejects future dates, so end is clamped to 3 days ago.
    const now = new Date();
    const seasonYear = now.getUTCMonth() < 4 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
    const latest = ymd(new Date(now.getTime() - 3 * 86_400_000));

    const startDate = searchParams.get('startDate') || `${seasonYear}0501`;
    const requestedEnd = searchParams.get('endDate') || `${seasonYear}1210`;

    if (!isYmd(startDate) || !isYmd(requestedEnd)) {
      return NextResponse.json({ success: false, error: 'Dates must be YYYYMMDD' }, { status: 400 });
    }
    const endDate = requestedEnd > latest ? latest : requestedEnd;
    if (startDate > endDate) {
      return NextResponse.json(
        { success: false, error: 'startDate must be on or before endDate (and no later than 3 days ago)' },
        { status: 400 }
      );
    }

    const envData = await buildEnvironmentData(lat, lon, startDate, endDate);
    const evaluation = evaluateCrops(envData);

    return NextResponse.json(
      { success: true, queryLocation: { lat, lon }, environment: envData, evaluation },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}