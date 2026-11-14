import { NextResponse } from 'next/server';
import { buildEnvironmentData } from '@/services/engine/environmentBuilder';
import { evaluateCrops } from '@/services/engine/cropEngine';

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const lat = parseFloat(searchParams.get('lat') || '16.8661');
    const lon = parseFloat(searchParams.get('lon') || '96.1951');

    // Default = the full rice -> black gram season of the current year (1 May - 10 Dec),
    // so Module 4 can see flowering, harvest and sowing. NASA POWER lags a few days and
    // rejects future dates, so the end date is clamped to 3 days ago.
    const now = new Date();
    const year = now.getUTCFullYear();
    const latest = ymd(new Date(now.getTime() - 3 * 86_400_000));
    const startDate = searchParams.get('startDate') || `${year}0501`;
    const requestedEnd = searchParams.get('endDate') || `${year}1210`;
    const endDate = requestedEnd > latest ? latest : requestedEnd;

    const envData = await buildEnvironmentData(lat, lon, startDate, endDate);
    const evaluationResult = evaluateCrops(envData);

    return NextResponse.json(
      {
        success: true,
        queryLocation: { lat, lon },
        environment: envData,
        evaluation: evaluationResult
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
